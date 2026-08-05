# Astah MCP

Servidor MCP local para criar e revisar diagramas UML no Astah. Ele gera um modelo de estação meteorológica a partir de um exercício de modelagem orientada a objetos e aplica regras de legibilidade ao layout.

O servidor usa a API oficial do Astah, cria o arquivo `.asta` e faz uma revisão visual obrigatória dos diagramas exportados. As exportações de revisão são temporárias: elas são enviadas ao cliente MCP e removidas automaticamente, portanto apenas o projeto `.asta` final permanece na pasta escolhida.

## O que o MCP faz

- Cria um modelo conceitual e um diagrama de classes detalhado.
- Mantém cada atividade solicitada em um único diagrama; não divide o modelo apenas por falta de espaço.
- Calcula a menor largura segura para cada classe, sem cortar texto.
- Prioriza alinhamento, simetria, linhas retas e rotas ortogonais quando uma relação precisa mudar de direção.
- Mantém generalizações em leques organizados e usa diagonais apenas quando elas melhoram a leitura.
- Exporta os diagramas para PNG, verifica dimensões e conteúdo e exige inspeção visual antes de concluir.
- Não sobrescreve um arquivo `.asta` existente, a menos que `overwrite: true` seja informado explicitamente.

## Requisitos

- Windows.
- [Astah UML](https://astah.net/products/astah-uml/) instalado.
- Node.js 18 ou superior.
- JDK com `java` e `javac` disponíveis no `PATH`.

Por padrão, o servidor procura o Astah em `C:\Program Files\astah-UML`. Se ele estiver em outra pasta, defina a variável de ambiente `ASTAH_HOME` antes de abrir o cliente MCP:

```powershell
[Environment]::SetEnvironmentVariable(
  "ASTAH_HOME",
  "D:\Aplicativos\astah-UML",
  "User"
)
```

Reabra o cliente MCP após definir a variável.

## Instalação

1. Clone ou baixe este repositório.
2. Confirme os requisitos:

```powershell
node --version
java -version
javac -version
```

3. Adicione o servidor à configuração do seu cliente MCP. Ajuste o caminho para o local onde você clonou o repositório:

```json
{
  "mcpServers": {
    "astah": {
      "command": "node",
      "args": [
        "C:\\caminho\\para\\astah-mcp\\astah-mcp-server.js"
      ]
    }
  }
}
```

Não há dependências npm externas: o servidor usa apenas módulos nativos do Node.js e as bibliotecas já instaladas com o Astah.

## Configuração em clientes MCP

### Antigravity IDE

Abra o painel do agente e escolha `...` → **MCP Servers** → **Manage MCP Servers** → **View raw config**. Adicione a configuração acima ao arquivo global `~/.gemini/config/mcp_config.json` ou ao arquivo local do projeto `.agents/mcp_config.json`.

### VS Code com GitHub Copilot

Abra a configuração de servidores MCP do VS Code e adicione o mesmo objeto `mcpServers`. Consulte a documentação do VS Code para a interface da versão instalada.

### Claude Desktop, Cline, Goose e outros clientes compatíveis

Use a mesma configuração `stdio`: comando `node` e o caminho absoluto de `astah-mcp-server.js` como argumento.

## Ferramentas disponíveis

### `create_meteorological_station_model`

Cria um novo projeto Astah e retorna as imagens temporárias da revisão visual.

```json
{
  "outputPath": "C:\\Projetos\\Estacao_Meteorologica.asta",
  "layoutProfile": "domain",
  "overwrite": false
}
```

- `outputPath`: caminho absoluto do novo arquivo `.asta`.
- `layoutProfile`: `domain` (padrão) ou `compact`.
- `overwrite`: somente use `true` quando quiser substituir intencionalmente um projeto existente.

### `verify_astah_visual_layout`

Exporta temporariamente os diagramas de um arquivo `.asta` existente, executa as verificações e retorna as imagens para revisão, sem modificar o projeto.

```json
{
  "projectPath": "C:\\Projetos\\Estacao_Meteorologica.asta"
}
```

### `get_astah_layout_guidelines`

Retorna as regras de organização visual adotadas pelo gerador.

### `validate_astah_environment`

Verifica se Astah, Java, API e exportador estão disponíveis, sem gerar ou modificar diagramas.

## Como funciona a revisão visual

1. O MCP cria ou abre o projeto Astah.
2. O Astah exporta os diagramas para uma pasta temporária do sistema.
3. O MCP confirma que os PNGs são válidos, legíveis e não vazios.
4. As imagens e os critérios de layout são retornados ao cliente.
5. A pasta temporária, os PNGs e o relatório são apagados automaticamente.

Assim, a pasta do exercício recebe somente o `.asta` final.

## Teste rápido

No diretório do repositório, execute:

```powershell
node tests\smoke-client.mjs "C:\\Temp\\Estacao_Meteorologica_teste.asta"
```

O teste cria um projeto novo, confirma que dois diagramas foram exportados e verifica que os arquivos de revisão foram removidos após o envio ao cliente.

## Estrutura do projeto

```text
astah-mcp/
├── astah-mcp-server.js              # Servidor MCP em Node.js
├── java/
│   └── MeteorologicalStationModel.java  # Gerador do modelo usando a API do Astah
├── tests/
│   └── smoke-client.mjs             # Teste de integração do MCP
├── docs/
│   └── LAYOUT_GUIDE.md              # Regras de layout e revisão visual
├── package.json
└── README.md
```

## Segurança

O servidor inicia processos locais do Node, Java e Astah. Instale-o somente a partir de uma cópia confiável e revise qualquer alteração antes de executá-la.
