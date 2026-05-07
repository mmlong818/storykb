import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths.mjs";
import { hashString } from "./hash.mjs";

export function createQueue(name) {
  const dir = path.join(paths.queue, name);
  const pendingPath = path.join(dir, "pending.jsonl");
  const completedPath = path.join(dir, "completed.jsonl");
  const failedPath = path.join(dir, "failed.jsonl");
  const inFlightDir = path.join(dir, "in_flight");
  fs.mkdirSync(inFlightDir, { recursive: true });

  const completedTaskIds = loadTaskIds(completedPath);
  const failedTaskIds = loadTaskIds(failedPath);
  const pendingTaskIds = loadTaskIds(pendingPath);

  return {
    dir,
    pendingPath,
    completedPath,
    failedPath,
    inFlightDir,

    enqueue(task) {
      const id = task.id || hashString(JSON.stringify(task.payload)).slice(0, 16);
      if (completedTaskIds.has(id) || failedTaskIds.has(id) || pendingTaskIds.has(id)) return { skipped: true, id };
      const record = { id, enqueuedAt: new Date().toISOString(), ...task };
      fs.appendFileSync(pendingPath, JSON.stringify(record) + "\n", "utf8");
      pendingTaskIds.add(id);
      return { skipped: false, id };
    },

    listPending() {
      if (!fs.existsSync(pendingPath)) return [];
      const lines = fs.readFileSync(pendingPath, "utf8").split("\n").filter(Boolean);
      const seen = new Set();
      const tasks = [];
      for (const line of lines) {
        const t = JSON.parse(line);
        if (!completedTaskIds.has(t.id) && !failedTaskIds.has(t.id) && !seen.has(t.id)) {
          seen.add(t.id);
          tasks.push(t);
        }
      }
      return tasks;
    },

    recoverInFlight() {
      const files = fs.readdirSync(inFlightDir).filter((name) => name.endsWith(".json"));
      for (const file of files) {
        const recovered = JSON.parse(fs.readFileSync(path.join(inFlightDir, file), "utf8"));
        if (!pendingTaskIds.has(recovered.id)) {
          fs.appendFileSync(pendingPath, JSON.stringify(recovered) + "\n", "utf8");
          pendingTaskIds.add(recovered.id);
        }
        fs.unlinkSync(path.join(inFlightDir, file));
      }
      return files.length;
    },

    claim(task) {
      const filePath = path.join(inFlightDir, `${task.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify({ ...task, claimedAt: new Date().toISOString() }, null, 2), "utf8");
    },

    complete(task, result) {
      const record = { id: task.id, completedAt: new Date().toISOString(), result };
      fs.appendFileSync(completedPath, JSON.stringify(record) + "\n", "utf8");
      completedTaskIds.add(task.id);
      const filePath = path.join(inFlightDir, `${task.id}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    },

    fail(task, error) {
      const record = { id: task.id, failedAt: new Date().toISOString(), error: String(error?.message || error), attempt: (task.attempt || 0) + 1 };
      fs.appendFileSync(failedPath, JSON.stringify(record) + "\n", "utf8");
      failedTaskIds.add(task.id);
      const filePath = path.join(inFlightDir, `${task.id}.json`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    },

    stats() {
      return {
        pending: this.listPending().length,
        completed: completedTaskIds.size,
        failed: failedTaskIds.size,
        inFlight: fs.readdirSync(inFlightDir).filter((n) => n.endsWith(".json")).length,
      };
    },

    listCompleted() {
      if (!fs.existsSync(completedPath)) return [];
      return fs.readFileSync(completedPath, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    },

    retryFailed() {
      if (!fs.existsSync(failedPath)) return 0;
      const lines = fs.readFileSync(failedPath, "utf8").split("\n").filter(Boolean);
      let count = 0;
      for (const line of lines) {
        try {
          const record = JSON.parse(line);
          if (record.id && !completedTaskIds.has(record.id)) {
            failedTaskIds.delete(record.id);
            count += 1;
          }
        } catch { /* ignore */ }
      }
      if (count > 0) {
        // Clear failed.jsonl — tasks already exist in pending.jsonl from original enqueue
        fs.writeFileSync(failedPath, "", "utf8");
      }
      return count;
    },
  };
}

function loadTaskIds(filePath) {
  if (!fs.existsSync(filePath)) return new Set();
  const ids = new Set();
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  for (const line of lines) {
    try {
      const record = JSON.parse(line);
      if (record.id) ids.add(record.id);
    } catch { /* ignore */ }
  }
  return ids;
}
