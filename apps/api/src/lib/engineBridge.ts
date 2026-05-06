import { spawn } from "child_process";
import path from "path";

export function evaluateDeal(input: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(process.cwd(), "apps/api/python/margin_engine.py");

    const py = spawn("python3", [scriptPath]);

    let data = "";
    let err = "";

    py.stdout.on("data", (chunk) => (data += chunk));
    py.stderr.on("data", (chunk) => (err += chunk));

    // ✅ Send input to Python
    py.stdin.write(JSON.stringify(input ?? {}));
    py.stdin.end();

    py.on("close", (code) => {
      if (err) {
        console.error("PYTHON STDERR:", err);
        return reject(err);
      }

      if (code !== 0) {
        return reject(`Python exited with code ${code}`);
      }

      try {
        resolve(JSON.parse(data));
      } catch (e) {
        console.error("RAW PYTHON OUTPUT:", data);
        reject("Invalid JSON from engine");
      }
    });
  });
}
