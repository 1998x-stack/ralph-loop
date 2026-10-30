'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { loadPRD, summarizePRD } = require('./prd-state');

const DEFAULTS = Object.freeze({
  maxIterations: 100,
  maxNoProgress: 3,
  tool: 'claude',
  promptFile: 'CLAUDE.md',
  prdFile: 'prd.json',
  timeoutSeconds: 900,
  iterationDelaySec: 3,
  logFile: 'ralph-run.log',
  verbose: false,
  dryRun: false,
});

function parseArgs(args) {
  const cfg = {};
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    const fields = { '--max-iterations':'maxIterations','--max-no-progress':'maxNoProgress', '--tool':'tool', '--prompt':'promptFile', '--prd':'prdFile', '--timeout-seconds':'timeoutSeconds', '--delay-seconds':'iterationDelaySec', '--log':'logFile' };
    if (flag === '--verbose') cfg.verbose = true;
    else if (flag === '--dry-run') cfg.dryRun = true;
    else if (flag === '--cost-limit') throw new Error('--cost-limit is not implemented: refusing to pretend a budget is enforced');
    else if (flag in fields) {
      if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`Missing value for ${flag}`);
      const v = args[++i];
      cfg[fields[flag]] = ['maxIterations','maxNoProgress','timeoutSeconds','iterationDelaySec'].includes(fields[flag]) ? Number(v) : v;
    } else throw new Error(`Unknown option: ${flag}`);
  }
  const c = { ...DEFAULTS, ...cfg };
  for (const field of ['maxIterations','maxNoProgress','timeoutSeconds']) if (!Number.isSafeInteger(c[field]) || c[field] < 1) throw new Error(`${field} must be a positive integer`);
  if (!Number.isSafeInteger(c.iterationDelaySec) || c.iterationDelaySec < 0) throw new Error('iterationDelaySec must be a nonnegative integer');
  if (!['claude','amp'].includes(c.tool)) throw new Error('tool must be claude or amp');
  return c;
}

function terminateTree(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform !== 'win32') process.kill(-child.pid, 'SIGTERM');
    else child.kill('SIGTERM');
  } catch { try { child.kill('SIGTERM'); } catch {} }
}

function executeCLI({ tool, prompt, cwd, timeoutSeconds, onOutput = () => {} }) {
  return new Promise(resolve => {
    const command = tool;
    const args = tool === 'claude' ? ['-p', prompt] : [];
    const start = Date.now();
    let finished = false;
    let timedOut = false;
    let output = '';
    let errorText = '';
    let child;
    let timer;
    let cancelled = false;
    const onInterrupt = () => { cancelled = true; terminateTree(child); };
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onInterrupt);
    const finish = (code, error = null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onInterrupt);
      resolve({ exitCode: code, output, errorText, timedOut, cancelled, error, durationMs: Date.now() - start });
    };
    try {
      child = spawn(command, args, {
        cwd, detached: process.platform !== 'win32',
        stdio: [tool === 'amp' ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        env: process.env,
      });
      if (tool === 'amp') { child.stdin.end(prompt); }
      const capture = (chunk, isError) => {
        const str = chunk.toString();
        if (isError) errorText = (errorText + str).slice(-131072);
        else output = (output + str).slice(-524288);
        onOutput(str, isError);
      };
      child.stdout.on('data', buf => capture(buf, false));
      child.stderr.on('data', buf => capture(buf, true));
      child.on('error', err => finish(null, err.message));
      child.on('close', code => finish(code));
      timer = setTimeout(() => {
        timedOut = true;
        terminateTree(child);
        const force = setTimeout(() => {
          if (!finished) {
            try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch {}
          }
        }, 3000);
        force.unref();
      }, timeoutSeconds * 1000);
    } catch (err) { finish(null, err.message); }
  });
}

class RalphLoop {
  constructor(config = {}, deps = {}) {
    this.config = parseArgs([]);
    this.config = { ...this.config, ...config };
    this.cwd = path.resolve(deps.cwd || process.cwd());
    this.execute = deps.execute || executeCLI;
    this.print = deps.print || (message => console.log(message));
  }
  fullPath(file) { return path.resolve(this.cwd, file); }
  status() { return summarizePRD(loadPRD(this.fullPath(this.config.prdFile))); }
  validate() {
    const status = this.status();
    if (!fs.existsSync(this.fullPath(this.config.promptFile))) throw new Error(`Missing prompt: ${this.config.promptFile}`);
    if (!this.config.dryRun) {
      execFileSync('git', ['rev-parse','--git-dir'], { cwd: this.cwd, stdio: 'ignore' });
    }
    return status;
  }
  appendLog(line) {
    fs.appendFileSync(this.fullPath(this.config.logFile), `[${new Date().toISOString()}] ${line}\n`);
  }
  async run() {
    this.validate();
    if (this.config.dryRun) {
      const state = this.status();
      this.print(JSON.stringify({ dryRun:true, nextStory: state.nextStory?.id ?? null, ...state }));
      return { success:true, reason:'dry-run', iterations:0 };
    }
    let noProgress = 0;
    for (let i = 1; i <= this.config.maxIterations; i++) {
      const before = this.status();
      if (before.allComplete) return { success:true, reason:'all-stories-passed', iterations:i-1 };
      if (!before.nextStory) return { success:false, reason:'stalled-or-blocked', iterations:i-1, state:before };
      this.print(`[${i}/${this.config.maxIterations}] ${before.nextStory.id} (${before.done}/${before.total} passed)`);
      const prompt = fs.readFileSync(this.fullPath(this.config.promptFile), 'utf8');
      const result = await this.execute({ tool:this.config.tool, prompt, cwd:this.cwd, timeoutSeconds:this.config.timeoutSeconds, onOutput:(text, err) => {
        this.appendLog(`${err ? 'stderr' : 'stdout'}: ${text.trimEnd()}`);
        if (this.config.verbose) (err ? process.stderr : process.stdout).write(text);
      } });
      this.appendLog(`iteration=${i} exit=${result.exitCode} timeout=${Boolean(result.timedOut)} duration_ms=${result.durationMs}`);
      if (result.cancelled) return { success:false, reason:'cancelled', iterations:i };
      if (result.timedOut) return { success:false, reason:'timeout', iterations:i };
      if (result.exitCode !== 0) return { success:false, reason:'agent-error', iterations:i, detail:result.error ?? result.errorText };
      const after = this.status();
      if (after.done > before.done + 1) return { success:false, reason:'multiple-stories-modified', iterations:i };
      const current = loadPRD(this.fullPath(this.config.prdFile));
      const stories = current.userStories ?? current.features;
      if (after.done > before.done && !stories.find(s => s.id === before.nextStory.id && s.passes)) {
        return { success:false, reason:'unexpected-story-completed', iterations:i };
      }
      noProgress = after.done > before.done ? 0 : noProgress + 1;
      if (after.allComplete) return { success:true, reason:'all-stories-passed', iterations:i };
      if (noProgress >= this.config.maxNoProgress) return { success:false, reason:'no-progress', iterations:i };
      if (!after.nextStory) return { success:false, reason:'stalled-or-blocked', iterations:i, state:after };
      if (i < this.config.maxIterations && this.config.iterationDelaySec) await new Promise(r => setTimeout(r, this.config.iterationDelaySec * 1000));
    }
    return { success:false, reason:'max-iterations', iterations:this.config.maxIterations, state:this.status() };
  }
}
module.exports = { RalphLoop, DEFAULTS, parseArgs, executeCLI };
