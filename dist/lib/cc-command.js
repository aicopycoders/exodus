export function formatCcCommand(argv) {
    const [cmd, ...rest] = argv;
    if (!cmd)
        return "";
    const parts = rest.map((arg) => {
        if (arg.startsWith("--"))
            return arg;
        if (/\s/.test(arg))
            return `"${arg.replace(/"/g, '\\"')}"`;
        return arg;
    });
    return `/${cmd}${parts.length ? " " + parts.join(" ") : ""}`;
}
