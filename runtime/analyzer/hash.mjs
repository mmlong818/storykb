import fs from "node:fs";
import crypto from "node:crypto";

export function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function hashString(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}
