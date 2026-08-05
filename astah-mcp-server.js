import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(fileURLToPath(import.meta.url));
const javaDir = path.join(root, "java");
const javaSource = path.join(javaDir, "MeteorologicalStationModel.java");
const javaClass = path.join(javaDir, "MeteorologicalStationModel.class");
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
  const missing = [astahJar, apiJar, astahJava, javaSource].filter(file => !existsSync(file));
  if (missing.length) throw new Error(`Arquivos necessários não encontrados: ${missing.join(", ")}`);
  return { astahHome, astahJar, apiJar, astahJava, astahCommandRunner, javaSource, compiled: existsSync(javaClass) };
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
  if (!existsSync(javaClass) || statSync(javaSource).mtimeMs > statSync(javaClass).mtimeMs) {
    await execute("javac", ["-encoding", "UTF-8", "-cp", [astahJar, apiJar].join(path.delimiter), javaSource], javaDir);
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
    await executeAstahExport(["-image", "cl", "-f", projectPath, "-o", reviewDirectory, "-t", "png"]);

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
      send({ jsonrpc: "2.0", id: request.id, result: { protocolVersion: request.params?.protocolVersion ?? "2024-11-05", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "astah-mcp", version: "3.0.0" } } });
    } else if (request.method === "ping") {
      send({ jsonrpc: "2.0", id: request.id, result: {} });
    } else if (request.method === "tools/list") {
      send({ jsonrpc: "2.0", id: request.id, result: { tools } });
    } else if (request.method === "tools/call") {
      try {
        const args = request.params?.arguments ?? {};
        let content;
        if (request.params?.name === "create_meteorological_station_model") {
          const result = await runGenerator(args.outputPath, args.layoutProfile ?? "domain", args.overwrite === true);
          content = buildAndCleanVisualReview(result.audit, result.generatorOutput.trim() || "Projeto Astah criado.");
        } else if (request.params?.name === "verify_astah_visual_layout") {
          content = buildAndCleanVisualReview(await exportAndAudit(args.projectPath), "Revisão visual exportada pelo Astah.");
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
