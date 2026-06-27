import { createInterface } from "node:readline";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
export async function promptYesNo(question, defaultValue = false) {
    const suffix = defaultValue ? "(Y/n)" : "(y/N)";
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await new Promise((resolve) => {
            rl.question(`${question} ${suffix} `, resolve);
        });
        const trimmed = answer.trim();
        if (!trimmed)
            return defaultValue;
        return /^y(es)?$/i.test(trimmed);
    }
    finally {
        rl.close();
    }
}
export async function promptChoice(question, options, defaultKey) {
    const keys = options.map((o) => o.key.toLowerCase());
    const labelLine = options
        .map((o) => o.key === defaultKey ? `[${o.key.toUpperCase()}] ${o.label}` : `[${o.key}] ${o.label}`)
        .join("  ");
    for (;;) {
        const rl = createInterface({ input: process.stdin, output: process.stdout });
        const answer = await new Promise((resolve) => {
            rl.question(`${question}\n${labelLine}\n> `, resolve);
        });
        rl.close();
        const trimmed = answer.trim().toLowerCase();
        if (!trimmed && defaultKey)
            return defaultKey;
        if (keys.includes(trimmed))
            return trimmed;
        process.stdout.write(`Please enter one of: ${keys.join(", ")}\n`);
    }
}
export async function promptMultiline(prompt) {
    process.stdout.write(`${prompt}\n(end with Ctrl-D on its own line)\n`);
    return await new Promise((resolve, reject) => {
        let buf = "";
        process.stdin.setEncoding("utf-8");
        const onData = (chunk) => {
            buf += chunk;
        };
        const onEnd = () => {
            cleanup();
            resolve(buf);
        };
        const onError = (err) => {
            cleanup();
            reject(err);
        };
        const cleanup = () => {
            process.stdin.off("data", onData);
            process.stdin.off("end", onEnd);
            process.stdin.off("error", onError);
        };
        process.stdin.on("data", onData);
        process.stdin.on("end", onEnd);
        process.stdin.on("error", onError);
    });
}
export function openInEditor(initial, fileSuffix = ".md") {
    const editor = process.env.EDITOR || process.env.VISUAL || "vi";
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "exodus-edit-"));
    const file = path.join(dir, `edit${fileSuffix}`);
    try {
        fs.writeFileSync(file, initial, "utf-8");
        const result = spawnSync(editor, [file], { stdio: "inherit" });
        if (result.status !== 0) {
            return null;
        }
        const out = fs.readFileSync(file, "utf-8");
        return out.replace(/\n+$/, "");
    }
    finally {
        try {
            fs.rmSync(dir, { recursive: true, force: true });
        }
        catch {
        }
    }
}
export async function promptText(question) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
        const answer = await new Promise((resolve) => {
            rl.question(`${question} `, resolve);
        });
        return answer.trim();
    }
    finally {
        rl.close();
    }
}
