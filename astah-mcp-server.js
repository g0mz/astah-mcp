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
  // A elipse só aproveita a parte central da largura; abaixo disso o Astah quebra o nome em duas linhas.
  if (node.kind === "use_case") return Math.max(nativeMinimum, Math.round(60 + String(node.name).length * 7.4));
  return Math.max(nativeMinimum, ...visible.map(text => 30 + String(text).length * 6.4));
}

function visualNodeWidth(node, members) {
  if (["initial", "final", "flow_final", "choice", "junction", "decision_merge", "connector", "shallow_history", "deep_history"].includes(node.kind)) return 30;
  if (["fork", "join"].includes(node.kind)) return 90;
  if (node.kind === "state") return Math.max(150, estimateNodeWidth(node, members));
  if (["action", "send_signal", "accept_event", "accept_time", "process"].includes(node.kind)) return Math.max(180, estimateNodeWidth(node, members));
  return estimateNodeWidth(node, members);
}

// Altura aproximada da caixa no Astah, medida nas apresentações geradas:
// cabeçalho de 26 px (41 com estereótipo) e 15 px por linha em cada compartimento.
function estimateNodeHeight(node, members) {
  const count = kind => members.filter(member => member.node === node.id && member.kind === kind).length;
  const compartment = lines => 8 + lines * 15;
  if (node.kind === "enumeration") return 41 + compartment(count("literal"));
  if (node.kind === "interface") return 45;
  if (node.kind === "object") return 30 + compartment(count("attribute"));
  if (["class", "abstract_class"].includes(node.kind)) return 26 + compartment(count("attribute")) + compartment(count("operation"));
  if (node.kind === "structured_class") return 85;
  return 40;
}

// gapY é o espaço livre entre linhas: cada linha tem a altura da sua caixa mais alta.
function centeredRows(nodes, members, columns, gapX = 70, gapY = 70) {
  const rows = [];
  for (let index = 0; index < nodes.length; index += columns) rows.push(nodes.slice(index, index + columns));
  const totals = rows.map(row => row.reduce((sum, node) => sum + estimateNodeWidth(node, members), 0) + gapX * Math.max(0, row.length - 1));
  const canvasWidth = Math.max(...totals, 300);
  let y = 30;
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    let x = 30 + (canvasWidth - totals[rowIndex]) / 2;
    for (const node of rows[rowIndex]) {
      node.width ??= estimateNodeWidth(node, members);
      node.x ??= Math.round(x);
      node.y ??= y;
      x += node.width + gapX;
    }
    y += Math.max(...rows[rowIndex].map(node => estimateNodeHeight(node, members))) + gapY;
  }
}

/**
 * Casos de uso no arranjo de Ambler (agilemodeling.com/style/useCaseDiagram.htm):
 * atores fora, casos empilhados na ordem em que acontecem, extensões e incluídos
 * logo abaixo do caso base, especializações abaixo do ator pai. Os dois atores
 * com mais casos ganham uma coluna cada, um em cada lado; os demais (sistemas
 * externos) ficam entre as colunas, ou à direita quando só há uma.
 * Retorna false quando não há associação para orientar o arranjo.
 */
function layoutUseCases(diagram) {
  const { nodes, links, members } = diagram;
  const byId = new Map(nodes.map(node => [node.id, node]));
  const isKind = (id, kind) => byId.get(id)?.kind === kind;
  // PITCH = elipse de 42 px (fixada no gerador Java) + 16 px de respiro.
  const PITCH = 58, LANE_GAP = 90, GROUP_GAP = 30, GAP = 130, ACTOR_HEIGHT = 75, MARGIN = 30;
  for (const node of nodes) node.width ??= estimateNodeWidth(node, members);

  const parentOf = new Map(links.filter(link => link.kind === "generalization" && isKind(link.source, "actor")).map(link => [link.source, link.target]));
  const root = id => { const seen = new Set(); while (parentOf.has(id) && !seen.has(id)) { seen.add(id); id = parentOf.get(id); } return id; };
  const pairs = links.filter(link => link.kind === "association").map(link => {
    const actor = isKind(link.source, "actor") ? link.source : isKind(link.target, "actor") ? link.target : null;
    const useCase = isKind(link.source, "use_case") ? link.source : isKind(link.target, "use_case") ? link.target : null;
    return actor && useCase ? { actor, family: root(actor), useCase } : null;
  }).filter(Boolean);
  if (!pairs.length) return false;

  const count = new Map();
  for (const pair of pairs) count.set(pair.family, (count.get(pair.family) ?? 0) + 1);
  const order = id => nodes.findIndex(node => node.id === id);
  const ranked = [...count.keys()].sort((a, b) => count.get(b) - count.get(a) || order(a) - order(b)).slice(0, 2);

  // Extensão aponta para o base; incluído é alvo do base.
  const baseOf = new Map();
  for (const link of links) {
    if (link.kind === "extend") baseOf.set(link.source, link.target);
    if (link.kind === "include") baseOf.set(link.target, link.source);
  }
  const groupOf = new Map();
  const resolveGroup = (id, seen = new Set()) => {
    if (groupOf.has(id)) return groupOf.get(id);
    const own = ranked.find(family => pairs.some(pair => pair.useCase === id && pair.family === family));
    let group = own !== undefined ? ranked.indexOf(own) : undefined;
    if (group === undefined && baseOf.has(id) && !seen.has(id)) { seen.add(id); group = resolveGroup(baseOf.get(id), seen); }
    groupOf.set(id, group ?? 0);
    return groupOf.get(id);
  };
  const useCases = nodes.filter(node => node.kind === "use_case");
  useCases.forEach(node => resolveGroup(node.id));
  const primaries = ranked.filter((_, index) => useCases.some(node => groupOf.get(node.id) === index));
  if (primaries.length < ranked.length) useCases.forEach(node => groupOf.set(node.id, 0));

  // Cada coluna: casos base empilhados na ordem informada. Incluídos e extensões
  // ficam na mesma linha do base, numa faixa do lado oposto ao ator (Ambler põe o
  // incluído à direita do base). Seta horizontal porque o Astah centraliza o
  // estereótipo sobre a linha: na vertical o tracejado corta o texto, na
  // horizontal o rótulo fica acima dela.
  const columns = primaries.map((_, index) => {
    const members = useCases.filter(node => groupOf.get(node.id) === index);
    const rootBase = node => { const seen = new Set(); let id = node.id; while (baseOf.has(id) && members.some(other => other.id === baseOf.get(id)) && !seen.has(id)) { seen.add(id); id = baseOf.get(id); } return id; };
    const rows = members.filter(node => rootBase(node) === node.id).map(node => ({ node, deps: members.filter(other => other !== node && rootBase(other) === node.id) }));
    const dependents = rows.flatMap(row => row.deps);
    const baseWidth = Math.max(...rows.map(row => row.node.width));
    const laneWidth = dependents.length ? Math.max(...dependents.map(node => node.width)) : 0;
    const height = rows.reduce((sum, row) => sum + Math.max(1, row.deps.length) * PITCH, 0) - PITCH;
    // Ator a uma distância proporcional à pilha: o leque fica aberto sem ficar íngreme.
    return { rows, baseWidth, laneWidth, gap: Math.max(GAP, Math.round(height * 0.4)) };
  });

  const family = id => nodes.filter(node => node.kind === "actor" && root(node.id) === id);
  const familyArea = id => {
    const children = family(id).filter(node => node.id !== id);
    const rowWidth = children.reduce((sum, node) => sum + node.width, 0) + 30 * Math.max(0, children.length - 1);
    return { children, width: Math.max(byId.get(id).width, rowWidth) };
  };
  const areas = primaries.map(familyArea);
  const secondaries = nodes.filter(node => node.kind === "actor" && !primaries.includes(root(node.id)));

  // Os grupos se empilham numa só coluna, com atores primários à esquerda e
  // sistemas externos à direita: duas colunas lado a lado dobravam a largura.
  const leftWidth = Math.max(...areas.map(area => area.width));
  const baseWidth = Math.max(...columns.map(column => column.baseWidth));
  const laneWidth = Math.max(...columns.map(column => column.laneWidth));
  const baseX = MARGIN + leftWidth + Math.max(...columns.map(column => column.gap));
  const laneX = baseX + baseWidth + LANE_GAP;
  let y = MARGIN;
  columns.forEach((column, index) => {
    if (index) y += GROUP_GAP;
    for (const row of column.rows) {
      row.node.x ??= baseX;
      row.node.y ??= y;
      row.deps.forEach((node, k) => {
        node.x ??= laneX;
        node.y ??= y + k * PITCH;
      });
      y += Math.max(1, row.deps.length) * PITCH;
    }
  });
  const rightX = (laneWidth ? laneX + laneWidth : baseX + baseWidth) + GAP;

  const centerY = id => byId.get(id).y + 21;
  const barycenter = actorIds => {
    const ys = pairs.filter(pair => actorIds.includes(pair.actor)).map(pair => centerY(pair.useCase));
    return ys.length ? ys.reduce((sum, value) => sum + value, 0) / ys.length : MARGIN + ACTOR_HEIGHT / 2;
  };
  // Cada família ocupa o ator pai e, quando houver, a linha de especializações abaixo dele.
  let floor = MARGIN;
  for (const id of primaries) {
    const { children } = areas[primaries.indexOf(id)];
    const parent = byId.get(id);
    const middle = MARGIN + leftWidth / 2;
    parent.x ??= Math.round(middle - parent.width / 2);
    parent.y ??= Math.round(Math.max(floor, barycenter(family(id).map(node => node.id)) - ACTOR_HEIGHT / 2));
    let x = middle - (children.reduce((sum, node) => sum + node.width, 0) + 30 * Math.max(0, children.length - 1)) / 2;
    for (const child of children) {
      child.x ??= Math.round(x);
      child.y ??= parent.y + ACTOR_HEIGHT + 50;
      x += child.width + 30;
    }
    floor = parent.y + ACTOR_HEIGHT + (children.length ? 50 + ACTOR_HEIGHT : 0) + 40;
  }

  // Ator externo no baricentro dos seus casos; se alguma linha dele cortar uma
  // elipse, tenta a altura de cada caso ligado (a linha fica horizontal ali).
  const ellipses = useCases.map(node => ({ id: node.id, x: node.x - 4, y: node.y - 4, w: node.width + 8, h: 50 }));
  const crosses = (actorY, actor) => pairs.filter(pair => pair.actor === actor.id).some(pair => {
    const target = byId.get(pair.useCase);
    const x1 = target.x + target.width, y1 = centerY(target.id), x2 = rightX + actor.width / 2, y2 = actorY + 30;
    for (let step = 1; step < 60; step++) {
      const px = x1 + (x2 - x1) * step / 60, py = y1 + (y2 - y1) * step / 60;
      if (ellipses.some(box => box.id !== target.id && px > box.x && px < box.x + box.w && py > box.y && py < box.y + box.h)) return true;
    }
    return false;
  });
  floor = MARGIN;
  const placements = secondaries.map(node => {
    const candidates = [barycenter([node.id]), ...pairs.filter(pair => pair.actor === node.id).map(pair => centerY(pair.useCase))].map(value => value - 30);
    return { node, y: candidates.find(value => !crosses(value, node)) ?? candidates[0] };
  });
  for (const actor of placements.sort((a, b) => a.y - b.y)) {
    actor.node.x ??= Math.round(rightX);
    actor.node.y ??= Math.round(Math.max(floor, actor.y));
    floor = actor.node.y + ACTOR_HEIGHT + 25;
  }
  return true;
}

/**
 * Fluxo em camadas para atividades e estados: cada nó desce para a camada
 * seguinte à do seu predecessor mais distante. O caminho principal (a primeira
 * saída de cada nó, na ordem dos links) fica na coluna central; cada ramo extra
 * de uma decisão ganha uma coluna lateral e volta ao centro na junção. Ramos
 * saem de lado e descem; retornos descem e entram de lado. Laços de volta
 * sobem por um corredor externo à direita, sem atravessar nenhum nó.
 * Retorna false quando há nós aninhados ou posições informadas.
 */
function layoutFlow(diagram) {
  const { nodes, members } = diagram;
  if (!diagram.links.length || nodes.some(node => node.parent || node.x !== undefined || node.y !== undefined)) return false;
  // GAP_Y: respiro entre camadas, suficiente para a seta e uma guarda.
  const GAP_Y = 52, COLUMN_GAP = 50, LANE_GAP = 30, MARGIN = 30;
  const heightOf = node => ({ action: 24, send_signal: 24, accept_event: 24, accept_time: 30, process: 24, state: 36, fork: 10, join: 10 })[node.kind] ?? 20;
  for (const node of nodes) node.width ??= visualNodeWidth(node, members);
  const links = diagram.links.filter(link => link.kind !== "dependency" && link.source !== link.target);
  const out = new Map(nodes.map(node => [node.id, links.filter(link => link.source === node.id)]));

  // Laços: arestas que voltam a um nó ainda aberto na busca em profundidade.
  // Os ramos laterais são explorados antes do principal para que o retorno
  // seja a última aresta do laço, e não a entrada do ramo na junção.
  const back = new Set(), seen = new Map();
  const visit = id => {
    seen.set(id, "open");
    for (const link of [...out.get(id)].reverse()) {
      if (seen.get(link.target) === "open") back.add(link);
      else if (!seen.has(link.target)) visit(link.target);
    }
    seen.set(id, "done");
  };
  const starts = nodes.filter(node => node.kind === "initial");
  (starts.length ? starts : [nodes[0]]).forEach(node => visit(node.id));
  nodes.forEach(node => { if (!seen.has(node.id)) visit(node.id); });
  const forward = links.filter(link => !back.has(link));

  const indegree = new Map(nodes.map(node => [node.id, forward.filter(link => link.target === node.id).length]));
  const queue = nodes.filter(node => !indegree.get(node.id)).map(node => node.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const link of forward.filter(item => item.source === id)) {
      indegree.set(link.target, indegree.get(link.target) - 1);
      if (!indegree.get(link.target)) queue.push(link.target);
    }
  }
  const layer = new Map(), column = new Map(), wanted = new Map(), taken = new Set();
  for (const id of order) {
    const parents = forward.filter(link => link.target === id).map(link => link.source);
    layer.set(id, parents.length ? Math.max(...parents.map(parent => layer.get(parent) + 1)) : 0);
    // Na junção o nó volta para a coluna mais próxima do centro entre as pedidas.
    const options = wanted.get(id) ?? [0];
    let col = options.reduce((best, value) => Math.abs(value) < Math.abs(best) ? value : best);
    while (taken.has(`${layer.get(id)}:${col}`)) col += col >= 0 ? 1 : -1;
    column.set(id, col);
    taken.add(`${layer.get(id)}:${col}`);
    forward.filter(link => link.source === id).forEach((link, index) => {
      wanted.set(link.target, [...(wanted.get(link.target) ?? []), col + index]);
    });
  }

  const byId = new Map(nodes.map(node => [node.id, node]));
  const widest = Math.max(...nodes.map(node => node.width));
  const minColumn = Math.min(...column.values());
  const centerX = id => MARGIN + widest / 2 + (column.get(id) - minColumn) * (widest + COLUMN_GAP);
  const layerTop = [];
  const layerCount = Math.max(...layer.values()) + 1;
  for (let index = 0, y = MARGIN; index < layerCount; index++) {
    layerTop.push(y);
    y += Math.max(...nodes.filter(node => layer.get(node.id) === index).map(heightOf)) + GAP_Y;
  }
  const top = id => layerTop[layer.get(id)];
  const centerY = id => top(id) + heightOf(byId.get(id)) / 2;
  for (const node of nodes) {
    node.x = Math.round(centerX(node.id) - node.width / 2);
    node.y = Math.round(top(node.id));
  }

  for (const link of forward) {
    const from = column.get(link.source), to = column.get(link.target);
    if (from === to) continue;
    link.points ??= Math.abs(to) < Math.abs(from)
      ? [[Math.round(centerX(link.source)), Math.round(centerY(link.target))]]
      : [[Math.round(centerX(link.target)), Math.round(centerY(link.source))]];
  }
  let lane = Math.max(...nodes.map(node => node.x + node.width)) + LANE_GAP;
  for (const link of back) {
    link.points ??= [[Math.round(lane), Math.round(centerY(link.source))], [Math.round(lane), Math.round(centerY(link.target))]];
    lane += 20;
  }
  return true;
}

/**
 * Classes sem herança, arranjadas em volta da classe com mais relações: as
 * classes ligadas a ela por associação ou dependência ficam à esquerda e à
 * direita, centralizadas na altura dela; as partes de composição e agregação
 * ficam numa linha abaixo, simétrica ao eixo dela; o restante (enumerações e
 * classes soltas) fecha o diagrama numa última linha centralizada.
 * Retorna false quando nenhuma classe tem duas relações ou alguma posição foi informada.
 */
function layoutClassHub(diagram) {
  const { nodes, links, members } = diagram;
  if (nodes.some(node => node.x !== undefined || node.y !== undefined)) return false;
  if (links.some(link => ["generalization", "realization"].includes(link.kind))) return false;
  // SIDE_GAP cabe o nome da associação com as duas multiplicidades.
  const SIDE_GAP = 150, ROW_GAP = 70, BOX_GAP = 70, STACK_GAP = 40, MARGIN = 30;
  const degree = id => links.filter(link => link.source === id || link.target === id).length;
  const hub = [...nodes].sort((a, b) => degree(b.id) - degree(a.id))[0];
  if (degree(hub.id) < 2) return false;
  for (const node of nodes) node.width ??= estimateNodeWidth(node, members);
  const height = node => estimateNodeHeight(node, members);
  const byId = new Map(nodes.map(node => [node.id, node]));

  const parts = [], peers = [];
  for (const link of links) {
    const other = link.source === hub.id ? link.target : link.target === hub.id ? link.source : null;
    if (!other || other === hub.id || parts.includes(byId.get(other)) || peers.includes(byId.get(other))) continue;
    const whole = ["composition", "aggregation"].includes(link.kind) && link.source === hub.id;
    (whole ? parts : peers).push(byId.get(other));
  }
  const rest = nodes.filter(node => node !== hub && !parts.includes(node) && !peers.includes(node));
  const left = peers.filter((_, index) => index % 2 === 0), right = peers.filter((_, index) => index % 2 === 1);

  const hubCenterY = MARGIN + Math.max(height(hub), ...[left, right].map(side => side.reduce((sum, node) => sum + height(node), 0) + STACK_GAP * Math.max(0, side.length - 1))) / 2;
  hub.y = Math.round(hubCenterY - height(hub) / 2);
  const leftWidth = Math.max(0, ...left.map(node => node.width));
  hub.x = MARGIN + (leftWidth ? leftWidth + SIDE_GAP : 0);
  const axis = hub.x + hub.width / 2;
  const stack = (side, x) => {
    let y = hubCenterY - (side.reduce((sum, node) => sum + height(node), 0) + STACK_GAP * Math.max(0, side.length - 1)) / 2;
    for (const node of side) {
      node.x = Math.round(x(node));
      node.y = Math.round(y);
      y += height(node) + STACK_GAP;
    }
  };
  stack(left, node => hub.x - SIDE_GAP - node.width);
  stack(right, () => hub.x + hub.width + SIDE_GAP);

  // Linhas abaixo: centralizadas no eixo da classe principal e alinhadas pelo topo.
  let y = Math.max(...[hub, ...peers].map(node => node.y + height(node))) + ROW_GAP;
  for (const row of [parts, rest].filter(group => group.length)) {
    let x = axis - (row.reduce((sum, node) => sum + node.width, 0) + BOX_GAP * (row.length - 1)) / 2;
    for (const node of row) {
      node.x = Math.round(x);
      node.y = Math.round(y);
      x += node.width + BOX_GAP;
    }
    y += Math.max(...row.map(height)) + ROW_GAP;
  }
  const shift = MARGIN - Math.min(...nodes.map(node => node.x));
  if (shift > 0) nodes.forEach(node => { node.x += shift; });
  return true;
}

function applyAutomaticLayout(diagram) {
  const nodes = diagram.nodes;
  const members = diagram.members;
  if (diagram.type === "sequence") {
    // A distância entre linhas de vida vizinhas cabe as duas cabeças e a maior
    // mensagem que passa entre elas; uma mensagem que cruza várias linhas
    // distribui o que faltar pelos vãos que atravessa.
    nodes.forEach(node => { node.width ??= estimateNodeWidth(node, members); });
    const index = new Map(nodes.map((node, position) => [node.id, position]));
    const span = nodes.slice(1).map((node, position) => (nodes[position].width + node.width) / 2 + 30);
    const labelWidth = link => 40 + String(link.label ?? "").length * 6.4;
    const calls = diagram.links.filter(link => link.kind !== "return" && link.source !== link.target);
    for (const link of [...calls].sort((a, b) => Math.abs(index.get(a.source) - index.get(a.target)) - Math.abs(index.get(b.source) - index.get(b.target)))) {
      const from = Math.min(index.get(link.source), index.get(link.target)), to = Math.max(index.get(link.source), index.get(link.target));
      const missing = labelWidth(link) - span.slice(from, to).reduce((sum, value) => sum + value, 0);
      for (let gap = from; missing > 0 && gap < to; gap++) span[gap] += missing / (to - from);
    }
    // Automensagem: o rótulo fica à direita da linha de vida, no vão seguinte.
    for (const link of diagram.links.filter(item => item.kind !== "return" && item.source === item.target)) {
      const position = index.get(link.source);
      if (position < span.length) span[position] = Math.max(span[position], labelWidth(link) + 40);
    }
    let center = 40 + nodes[0].width / 2;
    nodes.forEach((node, position) => {
      if (position) center += span[position - 1];
      node.x ??= Math.round(center - node.width / 2);
      node.y ??= 30;
    });
    diagram.links.forEach((link, index) => { link.y ??= 110 + index * 40; });
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
  if ((diagram.type === "activity" || diagram.type === "state_machine") && layoutFlow(diagram)) return;
  if (diagram.type === "activity" || diagram.type === "state_machine") {
    const columns = nodes.length > 10 ? 2 : 1;
    const ordered = nodes.map((node, index) => ({ node, index }));
    for (const { node, index } of ordered) {
      // Largura visual: o gerador centraliza cada símbolo nesta faixa.
      node.width ??= visualNodeWidth(node, members);
      const column = index % columns;
      const row = Math.floor(index / columns);
      const columnCenter = 170 + column * 300;
      node.x ??= Math.round(columnCenter - visualNodeWidth(node, members) / 2);
      node.y ??= 30 + row * 95;
    }
    return;
  }
  if (diagram.type === "composite_structure") {
    const parents = nodes.filter(node => node.kind === "structured_class");
    centeredRows(parents, members, Math.max(1, Math.ceil(Math.sqrt(parents.length))), 220, 100);
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

  if (diagram.type === "use_case" && layoutUseCases(diagram)) return;

  if (diagram.type === "class" && layoutClassHub(diagram)) return;

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
      lines.push(["LINK", encodeField(link.id), link.kind, encodeField(link.source), encodeField(link.target), encodeField(link.label), encodeField(sourceDetail), encodeField(link.targetMultiplicity), encodeField(link.reference), encodeField(link.points?.map(point => point.join(",")).join(";"))].join("\t"));
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
  "Padronize largura e alinhamento; use o menor corredor que deixe nomes, setas e multiplicidades livres, sem vazios sem função.",
  "Reserve corredores exclusivos para nomes e multiplicidades; encurte verbos e remova rótulos redundantes de generalizações.",
  "Prefira linhas ortogonais, conexões curtas e rótulos pequenos; evite diagonais, cruzamentos e troncos coincidentes.",
  "No modelo conceitual, exiba somente conceitos, verbos de relacionamento e cardinalidades.",
  "No modelo detalhado, mostre atributos essenciais, operações que representam regras e abstrações reais.",
  "Mantenha tudo o que foi pedido em um único diagrama; só crie mais visões quando o usuário solicitar explicitamente.",
  "Calcule cada caixa pelo maior texto visível e use a menor largura segura, sem cortar conteúdo.",
  "Priorize linhas retas; quando houver desvio, use segmentos ortogonais alinhados à grade.",
  "Distribua classes do mesmo nível simetricamente e mantenha centros, linhas e corredores alinhados.",
  "Casos de uso (Ambler): uma coluna na ordem em que acontecem, atores primários à esquerda, sistemas externos à direita, especializações abaixo do ator pai.",
  "Casos de uso: incluídos e extensões na mesma linha do caso base, à direita, com seta horizontal; include vai do base ao incluído e extend da extensão ao base.",
  "Casos de uso: relações retas em leque, presas às extremidades das elipses; nada de cotovelos ou corredores compartilhados.",
  "Classes sem herança: a classe com mais relações no centro, associadas nas laterais na altura dela, partes de composição abaixo e enumerações numa última linha, tudo simétrico ao eixo central.",
  "Sequência: linhas de vida espaçadas pela maior mensagem entre elas, chamadas aninhadas dentro da ativação aberta do receptor e mensagens escritas como nome(argumentos).",
  "Atividades e estados: camadas de cima para baixo, caminho principal (primeira saída de cada nó) na coluna central, ramos em colunas laterais e laços por um corredor externo à direita.",
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
                    id: { type: "string" }, kind: { type: "string", description: "Tipo da relação; consulte get_astah_capabilities. Em casos de uso, include vai do caso base ao incluído e extend da extensão ao caso base." },
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
