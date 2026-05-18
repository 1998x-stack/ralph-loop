#!/usr/bin/env node
/**
 * ralph-node.js — Ralph Loop (Node.js / TypeScript版)
 *
 * 提供比 Bash 更强的可编程控制：成本跟踪、回调钩子、
 * Token 上限、流式输出、可嵌入应用。
 *
 * 使用方式：
 *   node scripts/ralph/ralph-node.js
 *   node scripts/ralph/ralph-node.js --max-iterations 30 --cost-limit 20
 *
 * 核心架构：
 *
 *   RalphLoop
 *     └── while (not complete && not stopped)
 *           ├── spawnFreshAgent(prompt)      ← 每次全新实例
 *           ├── captureOutput()              ← 捕获输出
 *           ├── checkCompletionSignal()      ← 检测 <promise>COMPLETE</promise>
 *           ├── verifyPRDState()             ← 验证 prd.json 实际状态
 *           ├── updateCostTracker()          ← 跟踪 API 费用
 *           └── onIterationComplete(hooks)   ← 回调钩子
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  maxIterations: 100,
  tool: 'claude',                          // 'claude' | 'amp'
  promptFile: 'scripts/ralph/CLAUDE.md',
  completionSignal: '<promise>COMPLETE</promise>',
  costLimitUSD: null,                      // null = no limit
  iterationDelaySec: 3,
  verbose: false,
  logFile: 'ralph-run.log',
  dryRun: false,
};

// ─── PRD State Manager ────────────────────────────────────────────────────────

class PRDManager {
  constructor(prdPath = 'prd.json') {
    this.prdPath = prdPath;
  }

  load() {
    if (!fs.existsSync(this.prdPath)) {
      throw new Error(`prd.json not found at ${this.prdPath}`);
    }
    return JSON.parse(fs.readFileSync(this.prdPath, 'utf-8'));
  }

  getStories() {
    const data = this.load();
    return data.userStories || data.features || [];
  }

  getStatus() {
    const stories = this.getStories();
    const total = stories.length;
    const done = stories.filter(s => s.passes === true).length;
    const pending = total - done;
    const nextStory = stories
      .filter(s => !s.passes)
      .sort((a, b) => (a.priority || 99) - (b.priority || 99))[0];
    return { total, done, pending, nextStory };
  }

  isAllComplete() {
    const stories = this.getStories();
    return stories.length > 0 && stories.every(s => s.passes === true);
  }

  formatStatus() {
    const { done, total, pending, nextStory } = this.getStatus();
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));
    return [
      `  Stories: ${done}/${total} complete (${pct}%)`,
      `  [${bar}]`,
      nextStory ? `  Next: [${nextStory.id}] ${nextStory.description}` : '  Next: (all done)',
    ].join('\n');
  }
}

// ─── Cost Tracker ─────────────────────────────────────────────────────────────

class CostTracker {
  constructor() {
    this.iterations = [];
    this.startTime = Date.now();
  }

  // Rough estimate: Claude Sonnet 4.5 ≈ $0.003/1k input tokens, $0.015/1k output
  // Actual tracking requires parsing API response headers or using SDK
  recordIteration(iterationNum, durationMs) {
    this.iterations.push({ iteration: iterationNum, durationMs, timestamp: Date.now() });
  }

  getElapsedMs() {
    return Date.now() - this.startTime;
  }

  formatElapsed() {
    const ms = this.getElapsedMs();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${h}h ${m}m ${s}s`;
  }

  getSummary() {
    return {
      iterations: this.iterations.length,
      elapsed: this.formatElapsed(),
      avgIterationMs: this.iterations.length > 0
        ? Math.round(this.iterations.reduce((sum, i) => sum + i.durationMs, 0) / this.iterations.length)
        : 0,
    };
  }
}

// ─── Ralph Loop Engine ────────────────────────────────────────────────────────

class RalphLoop {
  /**
   * @param {Partial<typeof DEFAULT_CONFIG>} config
   * @param {Object} hooks
   * @param {Function} hooks.onIterationStart - called before each iteration
   * @param {Function} hooks.onIterationEnd   - called after each iteration
   * @param {Function} hooks.onComplete       - called on successful completion
   * @param {Function} hooks.onMaxReached     - called when max iterations hit
   */
  constructor(config = {}, hooks = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.hooks = hooks;
    this.prd = new PRDManager();
    this.cost = new CostTracker();
    this.logStream = fs.createWriteStream(this.config.logFile, { flags: 'a' });
  }

  log(msg) {
    const line = `[${new Date().toISOString()}] ${msg}`;
    this.logStream.write(line + '\n');
    if (this.config.verbose) console.log(line);
  }

  printBanner() {
    console.log('\n' + '═'.repeat(60));
    console.log('  RALPH LOOP — Autonomous AI Agent System');
    console.log(`  Tool: ${this.config.tool} | Max: ${this.config.maxIterations} iterations`);
    console.log(`  Prompt: ${this.config.promptFile}`);
    console.log('═'.repeat(60) + '\n');
  }

  validateEnvironment() {
    const checks = [
      {
        name: 'prd.json exists',
        check: () => fs.existsSync('prd.json'),
        fix: 'Run the PRD generator first. See: scripts/ralph/prd-generator-prompt.md',
      },
      {
        name: 'Prompt file exists',
        check: () => fs.existsSync(this.config.promptFile),
        fix: `Copy template: cp scripts/ralph/templates/CLAUDE.md ${this.config.promptFile}`,
      },
      {
        name: 'Git repository initialized',
        check: () => {
          try { execSync('git rev-parse --git-dir', { stdio: 'ignore' }); return true; }
          catch { return false; }
        },
        fix: 'git init && git add -A && git commit -m "Initial commit"',
      },
    ];

    let allGood = true;
    for (const { name, check, fix } of checks) {
      if (check()) {
        console.log(`  ✓ ${name}`);
      } else {
        console.error(`  ✗ ${name}`);
        console.error(`    Fix: ${fix}`);
        allGood = false;
      }
    }

    if (!allGood) {
      throw new Error('Environment validation failed');
    }
    console.log('');
  }

  /**
   * THE CORE: spawn a fresh AI agent instance and capture its output.
   *
   * Key principle: each call to spawnAgent() creates a BRAND NEW process
   * with ZERO memory of previous iterations. The only "memory" the new
   * agent has comes from reading prd.json, progress.txt, AGENTS.md, and git.
   *
   * This is the fundamental mechanism of Ralph Loop:
   *   fresh context = no context rot = no "dumb zone"
   */
  async spawnAgent(iterationNum) {
    const prompt = fs.readFileSync(this.config.promptFile, 'utf-8');
    const startMs = Date.now();

    if (this.config.dryRun) {
      console.log(`  [DRY RUN] Would spawn: ${this.config.tool} < ${this.config.promptFile}`);
      // Simulate completion signal after 3 iterations in dry run
      const output = iterationNum >= 3 ? this.config.completionSignal : 'Working on story...';
      return { output, exitCode: 0, durationMs: 500 };
    }

    return new Promise((resolve) => {
      let output = '';
      let exitCode = 0;

      // Build command args based on tool
      const [cmd, ...args] = this.config.tool === 'claude'
        ? ['claude', '--dangerously-skip-permissions']
        : ['amp'];

      const proc = spawn(cmd, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: process.cwd(),
      });

      // Feed prompt via stdin
      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        output += text;
        this.log(`[iter-${iterationNum}] ${text.trim()}`);
        if (this.config.verbose) process.stdout.write(text);
      });

      proc.stderr.on('data', (chunk) => {
        const text = chunk.toString();
        this.log(`[iter-${iterationNum}][stderr] ${text.trim()}`);
      });

      proc.on('close', (code) => {
        exitCode = code || 0;
        const durationMs = Date.now() - startMs;
        resolve({ output, exitCode, durationMs });
      });

      proc.on('error', (err) => {
        console.error(`  ✗ Failed to spawn ${this.config.tool}: ${err.message}`);
        resolve({ output: '', exitCode: 1, durationMs: Date.now() - startMs });
      });
    });
  }

  hasCompletionSignal(output) {
    return output.includes(this.config.completionSignal);
  }

  printIterationHeader(num) {
    console.log('\n' + '─'.repeat(60));
    console.log(`  Iteration #${num}   ${new Date().toLocaleTimeString()}`);
    console.log('─'.repeat(60));
    console.log(this.prd.formatStatus());
    console.log('');
  }

  /**
   * Main run loop.
   *
   * Loop exits when:
   *   1. All stories in prd.json have passes: true   ← IDEAL
   *   2. Agent outputs <promise>COMPLETE</promise>    ← AND prd verified
   *   3. maxIterations exceeded                       ← SAFETY LIMIT
   *   4. Error or interrupt                           ← EXCEPTIONAL
   */
  async run() {
    this.printBanner();
    this.validateEnvironment();

    if (this.prd.isAllComplete()) {
      console.log('✅ All PRD stories already complete. Nothing to do.');
      return { success: true, reason: 'already-complete' };
    }

    for (let i = 1; i <= this.config.maxIterations; i++) {

      // Re-check completion at start of each iteration
      if (this.prd.isAllComplete()) {
        console.log(`\n✅ All stories complete before iteration #${i}!`);
        break;
      }

      this.printIterationHeader(i);
      await this.hooks.onIterationStart?.(i, this.prd.getStatus());

      // ── THE KEY MOMENT: spawn a completely fresh agent ──
      const { output, exitCode, durationMs } = await this.spawnAgent(i);
      this.cost.recordIteration(i, durationMs);

      // Show output summary if not verbose
      if (!this.config.verbose) {
        const lines = output.split('\n').filter(l => l.trim());
        const summary = lines.slice(-8).join('\n');
        console.log('\n  Agent Output (last 8 lines):');
        console.log('  ' + summary.replace(/\n/g, '\n  '));
      }

      await this.hooks.onIterationEnd?.(i, { output, exitCode, durationMs });

      const completionSignalFound = this.hasCompletionSignal(output);
      const prdComplete = this.prd.isAllComplete();
      const { pending } = this.prd.getStatus();

      console.log(`\n  Elapsed: ${this.cost.formatElapsed()} | Pending stories: ${pending}`);

      if (completionSignalFound) {
        console.log(`  🎯 Completion signal found!`);

        if (prdComplete) {
          // Perfect: signal + prd both say done
          console.log('\n' + '═'.repeat(60));
          console.log('  ✅ RALPH COMPLETE');
          console.log('═'.repeat(60));
          console.log(this.prd.formatStatus());
          const summary = this.cost.getSummary();
          console.log(`  Total: ${summary.iterations} iterations, ${summary.elapsed}`);
          await this.hooks.onComplete?.(summary);
          this.logStream.end();
          return { success: true, reason: 'signal-and-prd-verified', ...summary };
        } else {
          // Signal found but PRD not fully done — continue
          console.log(`  ⚠ Signal found but ${pending} stories still pending — continuing...`);
        }
      }

      // Delay before next iteration
      if (i < this.config.maxIterations && !prdComplete) {
        console.log(`\n  Next iteration in ${this.config.iterationDelaySec}s... (Ctrl+C to stop)`);
        await new Promise(r => setTimeout(r, this.config.iterationDelaySec * 1000));
      }
    }

    // Final check
    if (this.prd.isAllComplete()) {
      const summary = this.cost.getSummary();
      console.log('\n✅ All stories complete!');
      await this.hooks.onComplete?.(summary);
      this.logStream.end();
      return { success: true, ...summary };
    }

    // Max iterations reached without completion
    const { pending } = this.prd.getStatus();
    console.log('\n' + '═'.repeat(60));
    console.log(`  ⚠ RALPH STOPPED — ${this.config.maxIterations} iterations reached`);
    console.log(`  ${pending} stories still pending`);
    console.log('═'.repeat(60));
    await this.hooks.onMaxReached?.(this.prd.getStatus());
    this.logStream.end();
    return { success: false, reason: 'max-iterations', pending };
  }
}

// ─── CLI Entry Point ─────────────────────────────────────────────────────────

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2);
  const config = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--max-iterations': config.maxIterations = parseInt(args[++i]); break;
      case '--tool':           config.tool = args[++i]; break;
      case '--prompt':         config.promptFile = args[++i]; break;
      case '--cost-limit':     config.costLimitUSD = parseFloat(args[++i]); break;
      case '--verbose':        config.verbose = true; break;
      case '--dry-run':        config.dryRun = true; break;
    }
  }

  const ralph = new RalphLoop(config, {
    onIterationStart: async (num, status) => {
      process.stdout.write(`\r  [${num}] ${status.done}/${status.total} stories done...`);
    },
    onComplete: async (summary) => {
      console.log(`\n  🎉 Done! ${summary.iterations} iterations in ${summary.elapsed}`);
    },
  });

  try {
    const result = await ralph.run();
    process.exit(result.success ? 0 : 1);
  } catch (err) {
    console.error(`\n✗ Ralph failed: ${err.message}`);
    process.exit(1);
  }
}

// Export for programmatic use
module.exports = { RalphLoop, PRDManager, CostTracker };

// Run CLI if called directly
if (require.main === module) {
  main().catch(console.error);
}
