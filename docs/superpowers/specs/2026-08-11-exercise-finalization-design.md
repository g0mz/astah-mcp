# Finalização e limpeza de exercícios

## Objetivo

Adicionar ao MCP um fluxo explícito de finalização que preserve somente os arquivos aprovados de um exercício. A limpeza ocorrerá apenas depois da confirmação visual do agente e ficará limitada à pasta de trabalho do exercício.

## Estrutura de diretórios

Cada exercício seguirá esta estrutura:

```text
exercícios/
└── <nome-do-exercício>/
    ├── trabalho/
    │   ├── tentativas .asta
    │   ├── PNGs de revisão
    │   └── scripts temporários de execução
    └── entregas/
        ├── projeto .asta aprovado
        └── PNGs aprovados
```

A pasta permanente `tests` do repositório não faz parte desse fluxo e nunca será removida pela ferramenta de finalização.

## Alterações em `create_astah_model`

A ferramenta receberá um campo opcional `exerciseDirectory`.

Quando esse campo for informado:

1. `exerciseDirectory` deverá ser um caminho absoluto.
2. `outputPath` deverá estar dentro de `<exerciseDirectory>/trabalho`.
3. As imagens exportadas para revisão serão copiadas para `trabalho` antes da remoção da pasta temporária do sistema.
4. A resposta informará os caminhos persistidos dos PNGs para permitir a escolha dos arquivos aprovados.

Quando `exerciseDirectory` não for informado, o comportamento atual será mantido para preservar a compatibilidade com clientes existentes.

## Nova ferramenta `finalize_astah_exercise`

A ferramenta receberá:

- `exerciseDirectory`: caminho absoluto da pasta do exercício;
- `approvedProjectPath`: caminho do `.asta` aprovado dentro de `trabalho`;
- `approvedImagePaths`: lista dos PNGs aprovados dentro de `trabalho`;
- `visualConfirmation`: confirmação obrigatória de que as imagens foram inspecionadas;
- `overwrite`: autorização opcional e explícita para substituir entregas existentes.

Sem `visualConfirmation: true`, a ferramenta recusará a operação e não alterará arquivos.

## Fluxo de finalização

1. Validar todos os caminhos antes de alterar o sistema de arquivos.
2. Confirmar que o projeto e os PNGs aprovados existem e estão dentro de `trabalho`.
3. Criar `entregas` quando ela ainda não existir.
4. Copiar os arquivos aprovados para nomes temporários dentro de `entregas`.
5. Verificar se as cópias possuem o mesmo tamanho dos arquivos de origem.
6. Renomear as cópias para os nomes finais.
7. Apagar a pasta `trabalho` inteira, incluindo tentativas e scripts temporários.
8. Retornar a lista dos arquivos preservados e a confirmação da limpeza.

Se qualquer etapa anterior à verificação das cópias falhar, a pasta `trabalho` será preservada. A limpeza só ocorrerá depois que todas as entregas tiverem sido confirmadas no destino.

## Limites de segurança

- A única exclusão recursiva permitida será o caminho exato `<exerciseDirectory>/trabalho`.
- A ferramenta rejeitará caminhos relativos, caminhos fora do exercício e o próprio diretório do exercício como alvo de exclusão.
- Links simbólicos e junções dentro de `trabalho` não serão seguidos durante a validação dos arquivos aprovados.
- Arquivos existentes em `entregas` não serão substituídos sem `overwrite: true`.
- A pasta `tests`, os fontes Java, o servidor MCP e outros arquivos do repositório não poderão ser passados como artefatos aprovados ou alvos de limpeza.

## Compilação Java

As classes Java compiladas pelo MCP deixarão de ser gravadas na pasta `java`. A compilação usará um diretório temporário próprio do processo do servidor. Esse diretório será removido quando o servidor encerrar, evitando arquivos `.class` intermediários no repositório.

## Documentação do cliente

O README orientará os agentes clientes a colocar tentativas, PNGs e scripts temporários dentro de `trabalho`. Arquivos criados fora dessa pasta não serão apagados automaticamente, pois o MCP não pode removê-los com segurança.

## Tratamento de erros

- Falta de confirmação visual: recusar sem mudanças.
- Arquivo aprovado ausente: recusar sem mudanças.
- Caminho fora de `trabalho`: recusar sem mudanças.
- Colisão em `entregas`: recusar sem mudanças, salvo autorização de sobrescrita.
- Falha durante a cópia ou verificação: remover apenas as cópias temporárias da operação e preservar `trabalho`.
- Falha ao apagar `trabalho` depois da entrega: manter as entregas e informar que a limpeza não foi concluída.

## Testes

Serão adicionados testes para confirmar que:

1. a finalização exige confirmação visual;
2. caminhos fora de `trabalho` são rejeitados;
3. o `.asta` e os PNGs aprovados chegam a `entregas` sem alteração de tamanho;
4. `trabalho` é removida somente após a cópia completa;
5. arquivos intermediários e scripts temporários dentro de `trabalho` são removidos;
6. a pasta permanente `tests` permanece intacta;
7. colisões em `entregas` preservam os arquivos de trabalho;
8. o fluxo antigo de `create_astah_model` continua funcionando sem `exerciseDirectory`;
9. o novo fluxo persiste os PNGs de revisão quando `exerciseDirectory` é informado;
10. a compilação não deixa arquivos `.class` na pasta `java`.
