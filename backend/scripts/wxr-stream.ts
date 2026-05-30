import fs from "fs";
import readline from "readline";

/** Stream WXR <item> blocks without loading the full file into memory. */
export async function* streamWxrItems(xmlPath: string): AsyncGenerator<string> {
  const rl = readline.createInterface({
    input: fs.createReadStream(xmlPath, { encoding: "utf8" }),
    crlfDelay: Infinity
  });

  let inItem = false;
  let lines: string[] = [];

  for await (const line of rl) {
    if (line.includes("<item>")) {
      inItem = true;
      lines = [];
      continue;
    }
    if (!inItem) continue;
    lines.push(line);
    if (line.includes("</item>")) {
      inItem = false;
      yield lines.join("\n");
      lines = [];
    }
  }
}
