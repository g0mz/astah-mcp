import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, "..", "astah-mcp-server.js");
const outputPath = process.argv[2];
if (!outputPath || !path.isAbsolute(outputPath)) throw new Error("Informe um caminho absoluto para um novo .asta.");

const child = spawn(process.execPath, [serverPath], { windowsHide: true });
let pending = "";
const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
const timeout = setTimeout(() => {
  child.kill();
  process.stderr.write("Timeout no teste MCP.\n");
  process.exitCode = 1;
}, 120000);

child.stderr.on("data", data => process.stderr.write(data));
child.stdout.setEncoding("utf8");
child.stdout.on("data", chunk => {
  pending += chunk;
  const lines = pending.split("\n");
  pending = lines.pop();
  for (const line of lines) {
    if (!line.trim()) continue;
    const response = JSON.parse(line);
    if (response.id === 1) {
      send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    } else if (response.id === 2) {
      const names = response.result.tools.map(tool => tool.name);
      for (const expected of ["create_astah_model", "get_astah_capabilities", "verify_astah_visual_layout"]) {
        if (!names.includes(expected)) throw new Error(`Ferramenta ausente: ${expected}.`);
      }
      send({
        jsonrpc: "2.0", id: 3, method: "tools/call",
        params: {
          name: "create_astah_model",
          arguments: {
            outputPath,
            exerciseContext: "Modele clientes que realizam pedidos.",
            diagrams: [{
              type: "class", name: "Modelo de Pedidos",
              nodes: [
                { id: "cliente", kind: "class", name: "Cliente" },
                { id: "pedido", kind: "class", name: "Pedido" }
              ],
              members: [
                { node: "cliente", kind: "attribute", name: "nome", type: "String" },
                { node: "pedido", kind: "operation", name: "calcularTotal", type: "decimal" }
              ],
              links: [{ kind: "association", source: "cliente", target: "pedido", label: "realiza", sourceMultiplicity: "1", targetMultiplicity: "0..*" }]
            }]
          }
        }
      });
    } else if (response.id === 3) {
      if (response.result?.isError) throw new Error(response.result.content?.[0]?.text ?? "Falha no gerador.");
      const content = response.result.content ?? [];
      const imageCount = content.filter(item => item.type === "image").length;
      const text = content.filter(item => item.type === "text").map(item => item.text).join("\n");
      if (imageCount !== 1) throw new Error(`Esperado 1 diagrama exportado; recebidos ${imageCount}.`);
      if (!text.includes('"visualConfirmationRequired": true')) throw new Error("Instrução de confirmação visual ausente.");
      if (!text.includes('"temporaryReview": true')) throw new Error("Revisão temporária não foi informada.");
      console.log(JSON.stringify({ server: "astah-mcp", version: "4.0.0", project: outputPath, exportedImages: imageCount, visualConfirmationRequired: true, temporaryReviewRemoved: true }, null, 2));
      clearTimeout(timeout);
      child.kill();
    }
  }
});

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "smoke-test", version: "1.0" } } });
