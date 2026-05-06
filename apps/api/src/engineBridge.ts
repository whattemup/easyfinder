import { spawn } from "child_process";

export function evaluateDeal(input: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const py = spawn("python", ["apps/api/python/margin_engine.py"]);

    let data = "";
    let err = "";

    py.stdout.on("data", (chunk) => (data += chunk));
    py.stderr.on("data", (chunk) => (err += chunk));

    py.on("close", () => {
      if (err) return reject(err);

      try {
        resolve(JSON.parse(data));
      } catch {
        reject("Invalid JSON from engine");
      }
    });

    py.stdin.write(JSON.stringify(input));
    py.stdin.end();
  });
}3
