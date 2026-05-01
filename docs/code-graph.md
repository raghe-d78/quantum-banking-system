# Code Knowledge Graph

The repository is indexed by [**graphify**](https://npm.im/graphify-mcp-tools)
into a navigable knowledge graph of every module, function, component
and their dependencies.

![Graphify code graph](./graphify-graph.png)

**Latest run** (`graphify-out/GRAPH_REPORT.md`):

- 173 nodes · 128 edges · **69 communities**
- 89% extracted · 10% inferred · 1% ambiguous
- 85 source files · ~438k tokens of context

The colour-coded clusters in the picture map directly to the project's
**bounded contexts**:

| Colour cluster        | Domain                                |
| --------------------- | ------------------------------------- |
| Orange (largest hub)  | `Money` value object — used everywhere |
| Cyan (top-left)       | Quantum / classical security stack    |
| Red (bottom-left)     | Transaction history & PDF/CSV export  |
| Green                 | Account repository (CRUD)             |
| Blue (bottom-centre)  | Auth context & protected React routes |
| Yellow                | Transfer wizard                       |
| Pink                  | Create / detail transaction forms     |

## Regenerating

The HTML/JSON artifacts and this PNG are committed for convenience. To
re-run after code changes:

```bash
# inside an MCP-enabled IDE (Cursor / Claude Code / Copilot CLI)
graphify build . --out graphify-out

# then refresh the screenshot (puppeteer renders graph.html headlessly)
node - <<'JS'
const puppeteer = require('puppeteer');
(async () => {
  const b = await puppeteer.launch({ headless: 'new' });
  const p = await b.newPage();
  await p.setViewport({ width: 1920, height: 1200 });
  await p.goto('file://' + process.cwd() + '/graphify-out/graph.html',
               { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 8000));   // settle layout
  await p.screenshot({ path: 'docs/graphify-graph.png' });
  await b.close();
})();
JS
```

The interactive HTML version (search, click-to-inspect, community
highlighting) is at [`graphify-out/graph.html`](../graphify-out/graph.html)
— open it locally in a browser.
