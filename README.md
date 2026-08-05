# Astah MCP

Servidor MCP local e genérico para transformar pedidos e enunciados de exercícios de modelagem em projetos nativos do Astah (`.asta`).

O usuário conversa normalmente com o agente do cliente MCP: pode descrever o modelo desejado, colar o enunciado ou anexar um PDF se o cliente conseguir lê-lo. O agente interpreta o conteúdo e chama o servidor com uma especificação estruturada; o usuário não precisa escrever JSON nem informar coordenadas.

O projeto foi construído sobre a API oficial do Astah. Ele implementa todos os tipos de diagrama que a instalação Astah UML permite criar nativamente por API e rejeita explicitamente tipos indisponíveis, evitando apresentar um diagrama aproximado como se fosse o tipo solicitado.

## Fluxo de uso

1. O usuário informa o que quer modelar ou fornece o enunciado do exercício.
2. O agente identifica elementos, propriedades, relações, multiplicidades e o tipo de diagrama adequado.
3. O MCP valida a especificação e cria o projeto nativo no Astah.
4. O servidor calcula um layout compacto quando não recebe posições explícitas.
5. O Astah exporta os diagramas para PNGs temporários.
6. O agente inspeciona as imagens e confirma que não há cortes ou sobreposições.
7. A pasta temporária é apagada; somente o `.asta` final permanece no caminho escolhido.

Por padrão, o MCP cria apenas um diagrama e comprime o conteúdo nele. Mais de um diagrama só é aceito quando o pedido ou o enunciado exige explicitamente várias visões.

## Diagramas suportados

Esta versão cria nativamente:

- diagrama de classes, incluindo classes abstratas, interfaces, enumerações e objetos;
- diagrama de casos de uso;
- diagrama de máquina de estados;
- diagrama de atividades;
- diagrama de sequência;
- diagrama de estrutura composta;
- mapa mental.

Também são suportados os principais elementos e relações próprios de cada tipo, como atributos, operações, literais, associações, agregações, composições, generalizações, realizações, dependências, atores, `include`, `extend`, transições, fluxos, mensagens, retornos, portas e conectores.

### Limites da API

Na edição Astah UML usada pelo servidor, a API não cria nativamente diagramas de comunicação, componentes, implantação, fluxograma, fluxo de dados, entidade-relacionamento, requisitos ou CRUD. Alguns elementos isolados, como `Component` e `Node`, existem na API de modelo, mas isso não habilita a criação do respectivo diagrama nativo.

Quando um desses tipos for solicitado, o MCP retorna uma explicação clara da limitação. Ele não troca silenciosamente o tipo pedido por outro. A matriz oficial de suporte pode variar entre produtos e versões do Astah: [Astah API Support](https://astah.net/support/astah-api/).

## Layout automático

O servidor:

- calcula a menor largura segura considerando nomes, atributos, operações e parâmetros;
- respeita o tamanho mínimo obrigatório de cada apresentação nativa do Astah;
- alinha elementos equivalentes em uma grade compacta e simétrica;
- centraliza superclasses acima das subclasses;
- organiza atividades e estados em fluxo vertical;
- distribui linhas de vida uniformemente;
- prioriza relações retas e usa segmentos ortogonais quando é necessário desviar;
- reserva corredores para rótulos, multiplicidades, portas e conectores;
- não divide um diagrama apenas para obter mais espaço;
- aceita posições explícitas quando o agente identifica que o enunciado exige um arranjo específico.

As regras completas estão em [`docs/LAYOUT_GUIDE.md`](docs/LAYOUT_GUIDE.md).

## Requisitos

- Windows;
- [Astah UML](https://astah.net/products/astah-uml/) instalado;
- Node.js 18 ou superior;
- JDK com `java` e `javac` no `PATH`.

Não há dependências npm externas. O servidor usa módulos nativos do Node.js e os arquivos JAR instalados com o Astah.

Por padrão, o Astah é procurado em `C:\Program Files\astah-UML`. Para usar outra instalação, defina `ASTAH_HOME` e reabra o cliente MCP:

```powershell
[Environment]::SetEnvironmentVariable(
  "ASTAH_HOME",
  "D:\Aplicativos\astah-UML",
  "User"
)
```

## Instalação

Clone o repositório:

```powershell
git clone https://github.com/g0mz/astah-mcp.git
cd astah-mcp
```

Confira o ambiente:

```powershell
node --version
java -version
javac -version
node astah-mcp-server.js
```

O último comando inicia o servidor via `stdio` e fica aguardando um cliente MCP. Use `Ctrl+C` para encerrá-lo.

## Configuração do cliente MCP

Adicione o servidor à configuração do cliente, substituindo o caminho pelo local do clone:

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

### Antigravity IDE

Abra o painel do agente e selecione `...` → **MCP Servers** → **Manage MCP Servers** → **View raw config**. Adicione o objeto acima ao arquivo global `~/.gemini/config/mcp_config.json` ou ao arquivo local `.agents/mcp_config.json` do projeto. Reinicie ou recarregue os servidores MCP.

### Outros clientes

Claude Desktop, VS Code com GitHub Copilot, Cline, Goose e outros clientes compatíveis com MCP podem usar a mesma configuração `stdio`: comando `node` e caminho absoluto de `astah-mcp-server.js`.

O cliente precisa ter um agente/modelo capaz de interpretar o enunciado e usar ferramentas MCP. Para enunciados em PDF, ele também precisa conseguir ler o anexo.

## Como pedir um modelo

Depois de configurar o servidor, escreva ao agente em linguagem natural. Exemplos:

```text
Crie no Astah um diagrama de classes para este enunciado e salve em
C:\Projetos\biblioteca.asta. Inclua atributos, operações, relações e multiplicidades.
```

```text
Leia o PDF anexado, resolva o exercício no Astah e crie somente o diagrama pedido.
Mantenha tudo compacto, reto e sem cortar textos.
```

```text
Modele o ciclo de vida de um pedido com uma máquina de estados e salve em
C:\Projetos\estados-pedido.asta.
```

Se o arquivo de saída já existir, o MCP não o substitui por padrão. O agente só deve enviar `overwrite: true` quando o usuário autorizar a substituição explicitamente.

## Ferramentas MCP

### `create_astah_model`

Ferramenta principal. Recebe do agente a interpretação estruturada do enunciado, cria um ou mais diagramas nativos e retorna as imagens temporárias para revisão visual.

Ela aceita:

- caminho absoluto do `.asta`;
- contexto original do exercício;
- tipo, nome, elementos, membros e relações de cada diagrama;
- coordenadas opcionais — quando omitidas, o layout é automático;
- autorização explícita para múltiplos diagramas e para sobrescrita.

O esquema completo é fornecido ao cliente automaticamente por `tools/list`; normalmente ninguém precisa montá-lo manualmente.

### `get_astah_capabilities`

Lista os tipos, elementos e relações criáveis na instalação atual e explica os tipos indisponíveis.

### `verify_astah_visual_layout`

Exporta e revisa um projeto `.asta` existente sem modificá-lo. Os PNGs e o relatório são temporários e apagados após serem carregados na resposta MCP.

### `get_astah_layout_guidelines`

Retorna as regras visuais usadas pelo gerador e pela inspeção final.

### `validate_astah_environment`

Confirma a presença do Astah, da API, do Java, do exportador e dos geradores, sem alterar projetos.

### Compatibilidade

`create_meteorological_station_model` continua disponível somente para clientes antigos que já dependiam dessa ferramenta. Novos exercícios devem usar `create_astah_model`.

## Testes

Teste genérico mínimo:

```powershell
node tests\smoke-client.mjs "C:\Temp\astah-mcp-smoke.asta"
```

Teste explícito de todos os sete tipos criáveis:

```powershell
node tests\all-diagrams-client.mjs "C:\Temp\astah-mcp-all.asta"
```

Use caminhos novos ou remova os projetos de teste antes de repetir, pois a proteção contra sobrescrita também vale nos testes.

## Estrutura

```text
astah-mcp/
├── astah-mcp-server.js
├── java/
│   ├── UniversalAstahModel.java
│   └── MeteorologicalStationModel.java
├── tests/
│   ├── smoke-client.mjs
│   └── all-diagrams-client.mjs
├── docs/
│   └── LAYOUT_GUIDE.md
├── package.json
└── README.md
```

## Segurança e arquivos temporários

O servidor inicia processos locais do Node.js, Java e Astah. Instale somente uma cópia confiável. Projetos existentes são protegidos contra substituição acidental. Especificações intermediárias, PNGs e relatórios de revisão são criados na pasta temporária do sistema e removidos automaticamente; o `.asta` solicitado é o único artefato permanente.
