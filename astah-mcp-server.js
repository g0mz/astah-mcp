import { spawn } from "node:child_process";
import { constants, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const javaDir = path.join(root, "java");
const javaSource = path.join(javaDir, "MeteorologicalStationModel.java");
const javaClass = path.join(javaDir, "MeteorologicalStationModel.class");
const universalJavaSource = path.join(javaDir, "UniversalAstahModel.java");
const universalJavaClass = path.join(javaDir, "UniversalAstahModel.class");
const astahHome = process.env.ASTAH_HOME ?? "C:\\Program Files\\astah-UML";
const astahJar = path.join(astahHome, "astah-uml.jar");
const apiJar = path.join(astahHome, "astah-api.jar");
// Mesmo executor e classe usados pelo astah-command.bat, chamados diretamente para evitar
// ambiguidades de escape do cmd.exe em caminhos com espaços.
const astahJava = path.join(astahHome, "jre", "bin", "java.exe");
const astahCommandRunner = "com.change_vision.jude.cmdline.JudeCommandRunner";

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function execute(command, args, cwd = root) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true });
    let output = "";
    child.stdout.on("data", data => output += data.toString("utf8"));
    child.stderr.on("data", data => output += data.toString("utf8"));
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve(output) : reject(new Error(output.trim() || `${command} terminou com código ${code}`)));
  });
}

function executeAstahExport(args) {
  return execute(astahJava, [
    "-Xms16m",
    "-Xmx1024m",
    `-Djava.library.path=${path.join(astahHome, "lib", "rlm")}`,
    "-cp",
    astahJar,
    astahCommandRunner,
    ...args
  ], root);
}

function validateEnvironment() {
  const missing = [astahJar, apiJar, astahJava, javaSource, universalJavaSource].filter(file => !existsSync(file));
  if (missing.length) throw new Error(`Arquivos necessários não encontrados: ${missing.join(", ")}`);
  return {
    astahHome, astahJar, apiJar, astahJava, astahCommandRunner,
    generators: { legacy: javaSource, universal: universalJavaSource },
    compiled: existsSync(javaClass) && existsSync(universalJavaClass)
  };
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function pngDimensions(filePath) {
  const data = readFileSync(filePath);
  if (data.length < 24 || data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`PNG inválido: ${filePath}`);
  }
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), bytes: data.length };
}

function removeTemporaryReview(reviewDirectory) {
  const temporaryRoot = path.resolve(tmpdir());
  const resolvedReview = path.resolve(reviewDirectory);
  const relativePath = path.relative(temporaryRoot, resolvedReview);
  if (
    relativePath.startsWith("..") || path.isAbsolute(relativePath) ||
    !path.basename(resolvedReview).startsWith("astah-mcp-review-")
  ) {
    throw new Error("Recusada a remoção de uma pasta que não pertence à revisão temporária do MCP.");
  }
  rmSync(resolvedReview, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
}

async function ensureCompiled() {
  validateEnvironment();
  const sources = [javaSource, universalJavaSource];
  const classes = [javaClass, universalJavaClass];
  if (sources.some((source, index) => !existsSync(classes[index]) || statSync(source).mtimeMs > statSync(classes[index]).mtimeMs)) {
    await execute("javac", ["-encoding", "UTF-8", "-cp", [astahJar, apiJar].join(path.delimiter), ...sources], javaDir);
  }
}

async function exportAndAudit(projectPath) {
  if (!path.isAbsolute(projectPath) || path.extname(projectPath).toLowerCase() !== ".asta") {
    throw new Error("projectPath deve ser um caminho absoluto terminado em .asta.");
  }
  if (!existsSync(projectPath)) throw new Error(`Projeto não encontrado: ${projectPath}`);
  validateEnvironment();

  const reviewDirectory = mkdtempSync(path.join(tmpdir(), "astah-mcp-review-"));
  try {
    await executeAstahExport(["-image", "-f", projectPath, "-o", reviewDirectory, "-t", "png"]);

    const images = listFiles(reviewDirectory).filter(file => path.extname(file).toLowerCase() === ".png").sort();
    if (!images.length) throw new Error("O Astah não exportou imagens para a revisão visual.");

    const diagrams = images.map(file => {
      const metrics = pngDimensions(file);
      const aspectRatio = Number((metrics.width / metrics.height).toFixed(2));
      const checks = {
        readableCanvas: metrics.width >= 300 && metrics.height >= 200,
        nonExtremeAspectRatio: aspectRatio <= 5,
        nonEmptyExport: metrics.bytes >= 4096
      };
      return { file, ...metrics, aspectRatio, checks, automaticChecksPassed: Object.values(checks).every(Boolean) };
    });

    const report = {
      projectPath,
      reviewDirectory,
      temporaryReview: true,
      generatedAt: new Date().toISOString(),
      referenceProfile: "Astah UML: fluxo principal horizontal, hierarquias verticais, linhas curtas e rótulos sem colisão",
      comparisonCriteria: [
        "nenhuma caixa de classe se sobrepõe a outra",
        "nomes e multiplicidades permanecem em corredores livres",
        "generalizações não recebem texto redundante",
        "linhas não atravessam classes, textos ou outras linhas",
        "todo o conteúdo pedido permanece em um único diagrama, salvo solicitação explícita por mais visões",
        "as caixas usam a menor largura que comporta seus textos sem cortes",
        "classes do mesmo nível permanecem alinhadas e distribuídas simetricamente",
        "relações alinhadas são retas; desvios usam segmentos ortogonais e diagonais só aparecem quando tornam a leitura mais clara",
        "a leitura principal segue da esquerda para a direita e de cima para baixo"
      ],
      automaticChecksPassed: diagrams.every(item => item.automaticChecksPassed),
      visualConfirmationRequired: true,
      visualInstruction: "Inspecione todas as imagens retornadas. Se houver sobreposição de classes, nomes, multiplicidades ou linhas, reajuste o layout, exporte novamente e repita a inspeção.",
      diagramCount: diagrams.length,
      diagrams
    };
    const reportPath = path.join(reviewDirectory, "layout-report.json");
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    return { report: { ...report, reportPath }, images, reviewDirectory };
  } catch (error) {
    removeTemporaryReview(reviewDirectory);
    throw error;
  }
}

function visualReviewContent(audit, heading) {
  const clientReport = {
    ...audit.report,
    reviewDirectory: "Pasta temporária removida após o envio das imagens.",
    reportPath: undefined,
    diagrams: audit.report.diagrams.map(({ file, ...diagram }) => ({ file: path.basename(file), ...diagram }))
  };
  const content = [{
    type: "text",
    text: `${heading}\n\n${JSON.stringify(clientReport, null, 2)}\n\nAs exportações desta revisão são temporárias e foram removidas após carregar as imagens. ATENÇÃO: as checagens automáticas não substituem a inspeção visual. Compare cada imagem abaixo com os critérios do relatório antes de encerrar a tarefa.`
  }];
  for (const file of audit.images) {
    content.push({ type: "text", text: `Diagrama exportado: ${file}` });
    content.push({ type: "image", data: readFileSync(file).toString("base64"), mimeType: "image/png" });
  }
  return content;
}

function buildAndCleanVisualReview(audit, heading) {
  try {
    return visualReviewContent(audit, heading);
  } finally {
    removeTemporaryReview(audit.reviewDirectory);
  }
}

async function runGenerator(outputPath, layoutProfile, overwrite) {
  if (!path.isAbsolute(outputPath)) throw new Error("outputPath deve ser um caminho absoluto.");
  if (path.extname(outputPath).toLowerCase() !== ".asta") throw new Error("outputPath deve terminar em .asta.");
  if (existsSync(outputPath) && !overwrite) throw new Error("O projeto já existe. Use outro caminho ou defina overwrite=true explicitamente.");
  await ensureCompiled();
  const classpath = [javaDir, astahJar, apiJar].join(path.delimiter);
  const generatorOutput = await execute("java", ["-cp", classpath, `-Djava.library.path=${path.join(astahHome, "lib", "rlm")}`, "MeteorologicalStationModel", outputPath, layoutProfile], javaDir);
  const audit = await exportAndAudit(outputPath);
  if (audit.images.length !== 2) {
    removeTemporaryReview(audit.reviewDirectory);
    throw new Error(`Produção incompleta: esperados 2 diagramas para as 2 atividades do exercício, mas o Astah exportou ${audit.images.length}.`);
  }
  return { generatorOutput, audit };
}

const diagramCapabilities = {
  class: {
    label: "classes e objetos",
    nodes: ["class", "abstract_class", "interface", "enumeration", "object"],
    links: ["association", "aggregation", "composition", "generalization", "realization", "usage", "dependency", "object_link"]
  },
  use_case: {
    label: "casos de uso",
    nodes: ["actor", "use_case"],
    links: ["association", "generalization", "include", "extend", "dependency"]
  },
  state_machine: {
    label: "máquina de estados",
    nodes: ["state", "initial", "final", "choice", "junction", "fork", "join", "shallow_history", "deep_history"],
    links: ["transition"]
  },
  activity: {
    label: "atividades",
    nodes: ["initial", "final", "flow_final", "action", "send_signal", "accept_event", "accept_time", "process", "decision_merge", "fork", "join", "connector"],
    links: ["flow", "dependency"]
  },
  sequence: {
    label: "sequência",
    nodes: ["lifeline"],
    links: ["message", "return", "create", "destroy"]
  },
  composite_structure: {
    label: "estrutura composta",
    nodes: ["structured_class", "port"],
    links: ["connector"]
  },
  mindmap: {
    label: "mapa mental",
    nodes: ["topic"],
    links: ["link"]
  }
};

const unsupportedDiagramTypes = {
  communication: "a API do Astah UML permite ler, mas não criar diagramas de comunicação",
  component: "a API permite criar elementos Component, mas não criar um diagrama de componentes nativo",
  deployment: "a API permite criar elementos Node, mas não criar um diagrama de implantação nativo",
  flowchart: "a API do Astah UML não cria fluxogramas",
  data_flow: "a API do Astah UML não cria diagramas de fluxo de dados",
  er: "a criação exige uma edição do Astah com suporte ER; não está disponível no Astah UML usado por este servidor",
  requirement: "a criação exige uma edição do Astah com suporte a diagramas de requisitos",
  crud: "a API do Astah UML não cria diagramas CRUD"
};

function assertText(value, field) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} deve ser um texto não vazio.`);
  return value.trim();
}

function estimateNodeWidth(node, members) {
  const visible = [node.name];
  for (const member of members.filter(item => item.node === node.id)) {
    if (member.kind === "attribute") visible.push(`- ${member.name} : ${member.type || "String"}`);
    if (member.kind === "operation") visible.push(`+ ${member.name}(${member.parameters || ""}) : ${member.type || "void"}`);
    if (member.kind === "literal") visible.push(member.name);
  }
  const nativeMinimum = node.kind === "structured_class" ? 250 : node.kind === "use_case" ? 170 : 110;
  return Math.max(nativeMinimum, ...visible.map(text => 30 + String(text).length * 6.4));
}

function visualNodeWidth(node, members) {
  if (["initial", "final", "flow_final", "choice", "junction", "decision_merge", "connector", "shallow_history", "deep_history"].includes(node.kind)) return 30;
  if (["fork", "join"].includes(node.kind)) return 90;
  if (node.kind === "state") return Math.max(150, estimateNodeWidth(node, members));
  if (["action", "send_signal", "accept_event", "accept_time", "process"].includes(node.kind)) return Math.max(180, estimateNodeWidth(node, members));
  return estimateNodeWidth(node, members);
}

function centeredRows(nodes, members, columns, gapX = 90, gapY = 190) {
  const rows = [];
  for (let index = 0; index < nodes.length; index += columns) rows.push(nodes.slice(index, index + columns));
  const totals = rows.map(row => row.reduce((sum, node) => sum + estimateNodeWidth(node, members), 0) + gapX * Math.max(0, row.length - 1));
  const canvasWidth = Math.max(...totals, 300);
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    let x = 30 + (canvasWidth - totals[rowIndex]) / 2;
    for (const node of rows[rowIndex]) {
      node.width ??= estimateNodeWidth(node, members);
      node.x ??= Math.round(x);
      node.y ??= 30 + rowIndex * gapY;
      x += node.width + gapX;
    }
  }
}

function applyAutomaticLayout(diagram) {
  const nodes = diagram.nodes;
  const members = diagram.members;
  if (diagram.type === "sequence") {
    nodes.forEach((node, index) => {
      node.width ??= estimateNodeWidth(node, members);
      node.x ??= 40 + index * 190;
      node.y ??= 30;
    });
    diagram.links.forEach((link, index) => { link.y ??= 110 + index * 55; });
    return;
  }
  if (diagram.type === "mindmap") {
    nodes.forEach((node, index) => {
      node.width ??= estimateNodeWidth(node, members);
      node.x ??= index === 0 ? 350 : 40 + (index % 4) * 220;
      node.y ??= index === 0 ? 250 : 30 + Math.floor(index / 4) * 150;
    });
    return;
  }
  if (diagram.type === "activity" || diagram.type === "state_machine") {
    const columns = nodes.length > 10 ? 2 : 1;
    const ordered = nodes.map((node, index) => ({ node, index }));
    for (const { node, index } of ordered) {
      node.width ??= estimateNodeWidth(node, members);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const columnCenter = 170 + column * 300;
      node.x ??= Math.round(columnCenter - visualNodeWidth(node, members) / 2);
      node.y ??= 30 + row * 145;
    }
    return;
  }
  if (diagram.type === "composite_structure") {
    const parents = nodes.filter(node => node.kind === "structured_class");
    centeredRows(parents, members, Math.max(1, Math.ceil(Math.sqrt(parents.length))), 220, 190);
    const portCounts = new Map();
    for (const node of nodes.filter(item => item.kind === "port")) {
      const owner = nodes.find(item => item.id === node.parent);
      const count = portCounts.get(node.parent) ?? 0;
      const related = diagram.links.find(link => link.source === node.id || link.target === node.id);
      const peerId = related ? (related.source === node.id ? related.target : related.source) : undefined;
      const peer = nodes.find(item => item.id === peerId);
      const peerOwner = peer ? nodes.find(item => item.id === peer.parent) : undefined;
      const leftSide = peerOwner && (peerOwner.x ?? 0) < (owner?.x ?? 0);
      node.width ??= 20;
      node.x ??= leftSide ? (owner?.x ?? 40) - 10 : (owner?.x ?? 40) + (owner?.width ?? 250) - 10;
      node.y ??= (owner?.y ?? 40) + 70 + count * 35;
      portCounts.set(node.parent, count + 1);
    }
    return;
  }

  const hierarchyLinks = diagram.links.filter(link => link.kind === "generalization");
  if (hierarchyLinks.length) {
    const level = new Map(nodes.map(node => [node.id, 0]));
    for (let pass = 0; pass < nodes.length; pass++) {
      let changed = false;
      for (const link of hierarchyLinks) {
        const candidate = (level.get(link.target) ?? 0) + 1;
        if (candidate > (level.get(link.source) ?? 0)) {
          level.set(link.source, candidate);
          changed = true;
        }
      }
      if (!changed) break;
    }
    const groups = [...new Set(level.values())].sort((a, b) => a - b).map(value => nodes.filter(node => level.get(node.id) === value));
    const maxColumns = Math.max(...groups.map(group => group.length));
    centeredRows(groups.flat(), members, maxColumns);
  } else {
    centeredRows(nodes, members, Math.max(1, Math.ceil(Math.sqrt(nodes.length))));
  }
}

function validateAndNormalizeSpecification(args) {
  if (!path.isAbsolute(args.outputPath ?? "") || path.extname(args.outputPath).toLowerCase() !== ".asta") {
    throw new Error("outputPath deve ser um caminho absoluto terminado em .asta.");
  }
  if (!Array.isArray(args.diagrams) || args.diagrams.length === 0) throw new Error("Informe ao menos um diagrama.");
  if (args.diagrams.length > 1 && args.multipleDiagramsRequested !== true) {
    throw new Error("Por padrão, todo o pedido deve caber em um único diagrama. Use multipleDiagramsRequested=true somente quando o enunciado ou o usuário pedir explicitamente mais de um.");
  }
  const diagrams = structuredClone(args.diagrams);
  for (const [diagramIndex, diagram] of diagrams.entries()) {
    diagram.type = assertText(diagram.type, `diagrams[${diagramIndex}].type`);
    diagram.name = assertText(diagram.name, `diagrams[${diagramIndex}].name`);
    if (unsupportedDiagramTypes[diagram.type]) throw new Error(`Não é possível criar '${diagram.type}' nativamente: ${unsupportedDiagramTypes[diagram.type]}.`);
    const capability = diagramCapabilities[diagram.type];
    if (!capability) throw new Error(`Tipo de diagrama desconhecido: ${diagram.type}. Tipos criáveis: ${Object.keys(diagramCapabilities).join(", ")}.`);
    if (!Array.isArray(diagram.nodes) || diagram.nodes.length === 0) throw new Error(`O diagrama '${diagram.name}' não possui elementos.`);
    diagram.members ??= [];
    diagram.links ??= [];
    if (!Array.isArray(diagram.members) || !Array.isArray(diagram.links)) throw new Error(`members e links de '${diagram.name}' devem ser listas.`);
    const ids = new Set();
    for (const [nodeIndex, node] of diagram.nodes.entries()) {
      node.id = assertText(node.id, `nodes[${nodeIndex}].id`);
      node.kind = assertText(node.kind, `nodes[${nodeIndex}].kind`);
      node.name ??= "";
      if (ids.has(node.id)) throw new Error(`ID de elemento duplicado em '${diagram.name}': ${node.id}.`);
      if (!capability.nodes.includes(node.kind)) throw new Error(`Elemento '${node.kind}' não é válido em ${capability.label}. Válidos: ${capability.nodes.join(", ")}.`);
      ids.add(node.id);
    }
    for (const member of diagram.members) {
      if (!ids.has(member.node)) throw new Error(`Membro referencia elemento inexistente: ${member.node}.`);
      if (!["attribute", "operation", "literal"].includes(member.kind)) throw new Error(`Tipo de membro inválido: ${member.kind}.`);
      member.name = assertText(member.name, "member.name");
    }
    const linkIds = new Set();
    for (const [linkIndex, link] of diagram.links.entries()) {
      link.id ??= `link_${linkIndex + 1}`;
      link.kind = assertText(link.kind, `links[${linkIndex}].kind`);
      if (!capability.links.includes(link.kind)) throw new Error(`Relação '${link.kind}' não é válida em ${capability.label}. Válidas: ${capability.links.join(", ")}.`);
      if (!ids.has(link.source) || !ids.has(link.target)) throw new Error(`Relação '${link.id}' referencia elemento inexistente.`);
      if (linkIds.has(link.id)) throw new Error(`ID de relação duplicado: ${link.id}.`);
      linkIds.add(link.id);
    }
    for (const link of diagram.links.filter(item => item.kind === "return")) {
      if (!link.reference || !linkIds.has(link.reference)) throw new Error(`Mensagem de retorno '${link.id}' precisa referenciar a mensagem original em reference.`);
    }
    applyAutomaticLayout(diagram);
  }
  return diagrams;
}

function encodeField(value) {
  if (value === undefined || value === null || value === "") return "-";
  return Buffer.from(String(value), "utf8").toString("base64url");
}

function serializeSpecification(diagrams) {
  const lines = ["# astah-mcp universal specification v1"];
  for (const diagram of diagrams) {
    lines.push(["DIAGRAM", diagram.type, encodeField(diagram.name)].join("\t"));
    for (const node of diagram.nodes) {
      lines.push(["NODE", encodeField(node.id), node.kind, encodeField(node.name), node.x, node.y, encodeField(node.parent), node.width, encodeField(node.classifier ?? node.type)].join("\t"));
    }
    for (const member of diagram.members) {
      lines.push(["MEMBER", encodeField(member.node), member.kind, encodeField(member.name), encodeField(member.type), encodeField(member.parameters)].join("\t"));
    }
    for (const link of diagram.links) {
      const sourceDetail = diagram.type === "sequence" ? link.y : link.sourceMultiplicity;
      lines.push(["LINK", encodeField(link.id), link.kind, encodeField(link.source), encodeField(link.target), encodeField(link.label), encodeField(sourceDetail), encodeField(link.targetMultiplicity), encodeField(link.reference)].join("\t"));
    }
  }
  return `${lines.join("\n")}\n`;
}

async function runUniversalGenerator(args) {
  const diagrams = validateAndNormalizeSpecification(args);
  if (existsSync(args.outputPath) && args.overwrite !== true) throw new Error("O projeto já existe. Use outro caminho ou defina overwrite=true explicitamente.");
  await ensureCompiled();
  const workingDirectory = mkdtempSync(path.join(tmpdir(), "astah-mcp-spec-"));
  const specificationPath = path.join(workingDirectory, "model.tsv");
  const temporaryProjectPath = path.join(workingDirectory, "model.asta");
  try {
    writeFileSync(specificationPath, serializeSpecification(diagrams), "utf8");
    const classpath = [javaDir, astahJar, apiJar].join(path.delimiter);
    const generatorOutput = await execute("java", ["-cp", classpath, `-Djava.library.path=${path.join(astahHome, "lib", "rlm")}`, "UniversalAstahModel", specificationPath, temporaryProjectPath], javaDir);
    mkdirSync(path.dirname(args.outputPath), { recursive: true });
    copyFileSync(temporaryProjectPath, args.outputPath, args.overwrite === true ? 0 : constants.COPYFILE_EXCL);
    const audit = await exportAndAudit(args.outputPath);
    if (audit.images.length !== diagrams.length) {
      removeTemporaryReview(audit.reviewDirectory);
      throw new Error(`Produção incompleta: solicitados ${diagrams.length} diagrama(s), mas o Astah exportou ${audit.images.length}.`);
    }
    return { generatorOutput, audit, diagrams };
  } finally {
    rmSync(workingDirectory, { recursive: true, force: true, maxRetries: 2, retryDelay: 100 });
  }
}

const layoutGuidelines = [
  "Organize o fluxo principal da esquerda para a direita e heranças de cima para baixo.",
  "Mantenha superclasses centralizadas acima das subclasses e distribua subclasses uniformemente.",
  "Use módulos visuais: monitoramento, manutenção, comercial e acesso.",
  "Padronize largura e alinhamento; preserve no mínimo 150 px de corredor entre caixas ligadas.",
  "Reserve corredores exclusivos para nomes e multiplicidades; encurte verbos e remova rótulos redundantes de generalizações.",
  "Prefira linhas ortogonais, conexões curtas e rótulos pequenos; evite diagonais, cruzamentos e troncos coincidentes.",
  "No modelo conceitual, exiba somente conceitos, verbos de relacionamento e cardinalidades.",
  "No modelo detalhado, mostre atributos essenciais, operações que representam regras e abstrações reais.",
  "Mantenha tudo o que foi pedido em um único diagrama; só crie mais visões quando o usuário solicitar explicitamente.",
  "Calcule cada caixa pelo maior texto visível e use a menor largura segura, sem cortar conteúdo.",
  "Priorize linhas retas; quando houver desvio, use segmentos ortogonais alinhados à grade.",
  "Distribua classes do mesmo nível simetricamente e mantenha centros, linhas e corredores alinhados.",
  "Ao final, exporte todas as visões para PNG e inspecione caixas, linhas, nomes e multiplicidades antes de concluir."
];

const tools = [
  {
    name: "create_astah_model",
    description: "Ferramenta principal e genérica. Depois de interpretar o pedido ou enunciado escrito pelo usuário, converta-o para esta especificação e crie diagramas nativos no Astah. Crie somente um diagrama por padrão; use vários apenas quando o usuário ou o enunciado os pedir explicitamente. O servidor calcula um layout compacto, alinhado e simétrico quando x/y não forem informados, exporta PNGs temporários para inspeção visual e preserva somente o .asta final.",
    inputSchema: {
      type: "object",
      properties: {
        outputPath: { type: "string", description: "Caminho absoluto do arquivo .asta final." },
        exerciseContext: { type: "string", description: "Pedido ou enunciado original, para registrar o contexto interpretado pelo agente." },
        diagrams: {
          type: "array", minItems: 1,
          description: "Diagramas pedidos. Use um único item, salvo solicitação explícita por mais diagramas.",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: Object.keys(diagramCapabilities) },
              name: { type: "string" },
              nodes: {
                type: "array", minItems: 1,
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", description: "Identificador local único." },
                    kind: { type: "string", description: "Tipo do elemento; consulte get_astah_capabilities." },
                    name: { type: "string" },
                    parent: { type: "string", description: "ID do elemento pai para tópicos, portas ou estados aninhados." },
                    classifier: { type: "string", description: "Classificador de um objeto ou tipo de uma porta, quando aplicável." },
                    x: { type: "number", description: "Opcional. Omitir para layout automático." },
                    y: { type: "number", description: "Opcional. Omitir para layout automático." },
                    width: { type: "number", minimum: 20, description: "Opcional. Omitir para largura mínima calculada pelo conteúdo." }
                  },
                  required: ["id", "kind", "name"], additionalProperties: false
                }
              },
              members: {
                type: "array", default: [],
                items: {
                  type: "object",
                  properties: {
                    node: { type: "string" }, kind: { type: "string", enum: ["attribute", "operation", "literal"] },
                    name: { type: "string" }, type: { type: "string" }, parameters: { type: "string", description: "Parâmetros no formato nome:Tipo, nome2:Tipo." }
                  },
                  required: ["node", "kind", "name"], additionalProperties: false
                }
              },
              links: {
                type: "array", default: [],
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" }, kind: { type: "string", description: "Tipo da relação; consulte get_astah_capabilities." },
                    source: { type: "string" }, target: { type: "string" }, label: { type: "string" },
                    sourceMultiplicity: { type: "string" }, targetMultiplicity: { type: "string" },
                    y: { type: "number", description: "Posição vertical de mensagem em diagramas de sequência; automática se omitida." },
                    reference: { type: "string", description: "ID da mensagem original para mensagens de retorno." }
                  },
                  required: ["kind", "source", "target"], additionalProperties: false
                }
              }
            },
            required: ["type", "name", "nodes"], additionalProperties: false
          }
        },
        multipleDiagramsRequested: { type: "boolean", default: false, description: "Defina true somente quando o pedido original exigir mais de um diagrama." },
        overwrite: { type: "boolean", default: false, description: "Deve ser true para substituir intencionalmente um arquivo existente." }
      },
      required: ["outputPath", "diagrams"], additionalProperties: false
    }
  },
  {
    name: "create_meteorological_station_model",
    description: "Cria um novo projeto Astah, exporta os diagramas para uma pasta temporária e retorna as imagens para a inspeção visual final de sobreposições. A pasta temporária é removida em seguida.",
    inputSchema: {
      type: "object",
      properties: {
        outputPath: { type: "string", description: "Caminho absoluto de um novo arquivo .asta." },
        layoutProfile: { type: "string", enum: ["domain", "compact"], default: "domain" },
        overwrite: { type: "boolean", default: false, description: "Deve ser true para substituir um arquivo existente." }
      },
      required: ["outputPath"], additionalProperties: false
    }
  },
  {
    name: "verify_astah_visual_layout",
    description: "Exporta diagramas de um projeto Astah existente em uma pasta temporária, executa checagens automáticas, retorna as imagens para comparação visual obrigatória e remove os arquivos temporários em seguida.",
    inputSchema: {
      type: "object",
      properties: { projectPath: { type: "string", description: "Caminho absoluto do arquivo .asta a revisar." } },
      required: ["projectPath"], additionalProperties: false
    }
  },
  {
    name: "get_astah_capabilities",
    description: "Lista exatamente os tipos de diagramas, elementos e relações que este servidor consegue criar nativamente na API instalada, além das limitações conhecidas.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "get_astah_layout_guidelines",
    description: "Retorna as regras de legibilidade e disposição aplicadas pelo servidor.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    name: "validate_astah_environment",
    description: "Valida a instalação, API, exportador e compilação do gerador Astah sem alterar projetos.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  }
];

let pending = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async chunk => {
  pending += chunk;
  const messages = pending.split("\n");
  pending = messages.pop();
  for (const line of messages) {
    if (!line.trim()) continue;
    let request;
    try { request = JSON.parse(line); } catch { continue; }
    if (request.method === "initialize") {
      send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: request.params?.protocolVersion ?? "2024-11-05", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "astah-mcp", version: "4.0.0" } } });
    } else if (request.method === "ping") {
      send({ jsonrpc: "2.0", id: request.id, result: {} });
    } else if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools } });
    } else if (request.method === "tools/call") {
      try {
        const args = request.params?.arguments ?? {};
        let content;
        if (request.params?.name === "create_astah_model") {
          const result = await runUniversalGenerator(args);
          content = buildAndCleanVisualReview(result.audit, result.generatorOutput.trim() || "Projeto Astah criado.");
        } else if (request.params?.name === "create_meteorological_station_model") {
          const result = await runGenerator(args.outputPath, args.layoutProfile ?? "domain", args.overwrite === true);
          content = buildAndCleanVisualReview(result.audit, result.generatorOutput.trim() || "Projeto Astah criado.");
        } else if (request.params?.name === "verify_astah_visual_layout") {
          content = buildAndCleanVisualReview(await exportAndAudit(args.projectPath), "Revisão visual exportada pelo Astah.");
        } else if (request.params?.name === "get_astah_capabilities") {
          content = [{ type: "text", text: JSON.stringify({ creatable: diagramCapabilities, notCreatableNatively: unsupportedDiagramTypes }, null, 2) }];
        } else if (request.params?.name === "get_astah_layout_guidelines") {
          content = [{ type: "text", text: layoutGuidelines.map((item, index) => `${index + 1}. ${item}`).join("\n") }];
        } else if (request.params?.name === "validate_astah_environment") {
          content = [{ type: "text", text: JSON.stringify(validateEnvironment(), null, 2) }];
        } else throw new Error("Ferramenta não encontrada.");
        send({ jsonrpc: "2.0", id: request.id, result: { content } });
      } catch (error) {
        send({ jsonrpc: "2.0", id: request.id, result: { isError: true, content: [{ type: "text", text: error.message }] } });
      }
    } else if (request.id != null && request.method !== "notifications/initialized") {
      send({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Método não encontrado." } });
    }
  }
});
