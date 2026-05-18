/**
 * Strip Cursor attribution from commit messages (stdin or file).
 * Used by git filter-branch and prepare-commit-msg hook.
 */
import fs from "fs";

const path = process.argv[2];
let msg;
if (path) {
  msg = fs.readFileSync(path, "utf8");
} else {
  msg = fs.readFileSync(0, "utf8");
}

const lines = msg.split(/\r?\n/).filter((line) => {
  if (/^Co-authored-by:\s*Cursor\s*</i.test(line)) return false;
  if (/^Made-with:\s*Cursor\s*$/i.test(line)) return false;
  return true;
});

let out = lines.join("\n");
if (out.length && !out.endsWith("\n")) out += "\n";

if (path) {
  fs.writeFileSync(path, out);
} else {
  process.stdout.write(out);
}
