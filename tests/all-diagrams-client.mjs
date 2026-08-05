import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.resolve(here, "..", "astah-mcp-server.js");
const outputPath = process.argv[2];
if (!outputPath || !path.isAbsolute(outputPath)) throw new Error("Informe um caminho absoluto para um novo .asta.");

const diagrams = [
  {
    type: "class", name: "Classes",
    nodes: [
      { id: "pessoa", kind: "abstract_class", name: "Pessoa" },
      { id: "cliente", kind: "class", name: "Cliente" },
      { id: "repositorio", kind: "interface", name: "Repositorio" },
      { id: "status", kind: "enumeration", name: "Status" },
      { id: "obj", kind: "object", name: "clienteAtual", classifier: "Cliente" }
    ],
    members: [
      { node: "pessoa", kind: "attribute", name: "nome", type: "String" },
      { node: "cliente", kind: "operation", name: "comprar", type: "void", parameters: "produto:Produto" },
      { node: "status", kind: "literal", name: "ATIVO" }
    ],
    links: [
      { id: "heranca", kind: "generalization", source: "cliente", target: "pessoa" },
      { id: "uso", kind: "dependency", source: "cliente", target: "repositorio", label: "usa" }
    ]
  },
  {
    type: "use_case", name: "Casos de Uso",
    nodes: [
      { id: "usuario", kind: "actor", name: "Usuário" },
      { id: "comprar", kind: "use_case", name: "Realizar compra" },
      { id: "autenticar", kind: "use_case", name: "Autenticar" }
    ],
    links: [
      { kind: "association", source: "usuario", target: "comprar" },
      { kind: "include", source: "comprar", target: "autenticar", label: "include" }
    ]
  },
  {
    type: "state_machine", name: "Estados do Pedido",
    nodes: [
      { id: "inicio", kind: "initial", name: "" },
      { id: "novo", kind: "state", name: "Novo" },
      { id: "pago", kind: "state", name: "Pago" },
      { id: "fim", kind: "final", name: "" }
    ],
    links: [
      { kind: "transition", source: "inicio", target: "novo" },
      { kind: "transition", source: "novo", target: "pago", label: "pagar" },
      { kind: "transition", source: "pago", target: "fim" }
    ]
  },
  {
    type: "activity", name: "Processar Compra",
    nodes: [
      { id: "inicio", kind: "initial", name: "" },
      { id: "validar", kind: "action", name: "Validar carrinho" },
      { id: "decisao", kind: "decision_merge", name: "" },
      { id: "pagar", kind: "action", name: "Processar pagamento" },
      { id: "fim", kind: "final", name: "" }
    ],
    links: [
      { kind: "flow", source: "inicio", target: "validar" },
      { kind: "flow", source: "validar", target: "decisao" },
      { kind: "flow", source: "decisao", target: "pagar", label: "[válido]" },
      { kind: "flow", source: "pagar", target: "fim" }
    ]
  },
  {
    type: "sequence", name: "Finalizar Compra",
    nodes: [
      { id: "cliente", kind: "lifeline", name: "Cliente" },
      { id: "servico", kind: "lifeline", name: "ServicoCompra" },
      { id: "gateway", kind: "lifeline", name: "GatewayPagamento" }
    ],
    links: [
      { id: "m1", kind: "message", source: "cliente", target: "servico", label: "finalizar()" },
      { id: "m2", kind: "message", source: "servico", target: "gateway", label: "pagar()" },
      { id: "r2", kind: "return", source: "gateway", target: "servico", label: "aprovado", reference: "m2" }
    ]
  },
  {
    type: "composite_structure", name: "Estrutura do Serviço",
    nodes: [
      { id: "compra", kind: "structured_class", name: "ServicoCompra" },
      { id: "pagamento", kind: "structured_class", name: "ServicoPagamento" },
      { id: "p1", kind: "port", name: "saida", parent: "compra", classifier: "IPagamento" },
      { id: "p2", kind: "port", name: "entrada", parent: "pagamento", classifier: "IPagamento" }
    ],
    links: [{ kind: "connector", source: "p1", target: "p2", label: "pagamento" }]
  },
  {
    type: "mindmap", name: "Escopo do Sistema",
    nodes: [
      { id: "raiz", kind: "topic", name: "Sistema de Vendas" },
      { id: "clientes", kind: "topic", name: "Clientes", parent: "raiz" },
      { id: "pedidos", kind: "topic", name: "Pedidos", parent: "raiz" },
      { id: "pagamentos", kind: "topic", name: "Pagamentos", parent: "pedidos" }
    ]
  }
];

const child = spawn(process.execPath, [serverPath], { windowsHide: true });
let pending = "";
const send = message => child.stdin.write(`${JSON.stringify(message)}\n`);
const timeout = setTimeout(() => {
  child.kill();
  process.stderr.write("Timeout no teste de todos os diagramas.\n");
  process.exitCode = 1;
}, 180000);

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
      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "create_astah_model", arguments: { outputPath, exerciseContext: "Teste explícito de todos os tipos criáveis", diagrams, multipleDiagramsRequested: true } } });
    } else if (response.id === 2) {
      if (response.result?.isError) throw new Error(response.result.content?.[0]?.text ?? "Falha no gerador universal.");
      const imageCount = (response.result?.content ?? []).filter(item => item.type === "image").length;
      if (imageCount !== diagrams.length) throw new Error(`Esperados ${diagrams.length} diagramas; recebidos ${imageCount}.`);
      console.log(JSON.stringify({ project: outputPath, diagramTypes: diagrams.map(item => item.type), exportedImages: imageCount }, null, 2));
      clearTimeout(timeout);
      child.kill();
    }
  }
});

send({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "all-diagrams-test", version: "1.0" } } });
