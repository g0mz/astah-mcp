# Guia de layout UML para Astah

Estas regras são aplicadas pelo gerador e pela verificação final do MCP. O foco é geometria, fluxo e legibilidade; cores são apenas neutras.

## Estrutura visual

1. Organize a história principal do domínio da esquerda para a direita.
2. Coloque superclasses centralizadas acima das subclasses.
3. Mantenha todos os elementos pedidos em um único diagrama; somente crie outra visão mediante solicitação explícita.
4. Calcule cada caixa pelo maior texto visível e use a menor largura que não corte o conteúdo.
5. Alinhe classes do mesmo nível e preserve apenas o corredor mínimo seguro entre caixas ligadas.
6. Evite linhas ou textos sobre qualquer caixa, atributo ou operação.
7. Distribua elementos equivalentes simetricamente em torno do eixo da superclasse ou do módulo.

## Relacionamentos

1. Use verbos curtos, preferencialmente com até 20 caracteres.
2. Não nomeie generalizações: a seta triangular já comunica a relação UML.
3. Posicione cardinalidades junto aos extremos, sem concorrer com o nome da associação.
4. Use rotas ortogonais somente quando houver um corredor livre; em hierarquias, prefira um leque limpo.
5. Não aceite linhas coincidentes, cruzamentos desnecessários ou símbolos de salto.
6. Se duas relações disputarem o mesmo corredor, reposicione e compacte as classes no mesmo diagrama.
7. Priorize um único segmento reto; quando for necessário desviar, use segmentos horizontais e verticais com ângulos de 90 graus.
8. Use diagonais somente em leques de generalização ou quando elas forem mais claras que uma rota ortogonal.

## Divisão das visões

- Modelo conceitual: conceitos, relacionamentos e multiplicidades.
- Diagrama de classes — domínio: atributos, operações, relações e todas as hierarquias no mesmo canvas.
- Diagramas auxiliares: somente quando forem pedidos explicitamente pelo usuário.

## Verificação final obrigatória

Após toda produção:

1. exporte todas as visões para PNG com a ferramenta oficial de linha de comando;
2. confira se cada imagem tem dimensão legível, proporção não extrema e conteúdo não vazio;
3. examine visualmente cada imagem em escala suficiente para ler nomes e multiplicidades;
4. compare com os critérios oficiais: fluxo claro, alinhamento, hierarquia vertical e linhas fáceis de seguir;
5. rejeite o resultado se existir qualquer sobreposição de classes, nomes, multiplicidades ou linhas;
6. reajuste, exporte novamente e repita toda a inspeção.
7. trate PNGs e `layout-report.json` como artefatos temporários: após serem enviados ao cliente MCP, eles são removidos automaticamente.

## Checklist visual

- Nenhuma classe toca ou cobre outra.
- Cada nome de associação possui espaço em branco ao redor.
- Multiplicidades não encostam em nomes, setas ou caixas.
- Nenhuma linha atravessa uma classe ou texto.
- Generalizações não têm texto redundante.
- O caminho de cada relação pode ser seguido sem ambiguidade.
- As hierarquias estão equilibradas em torno da superclasse.
- Classes do mesmo nível compartilham a mesma linha de base e espaçamento visual regular.
- Relações alinhadas são retas e mudanças de direção seguem corredores ortogonais.
- Não há grandes vazios sem função; as caixas estão compactadas até o menor tamanho legível.

## Referências oficiais

- [Astah — Layout and align objects](https://astah.net/support/astah-pro/user-guide/layout-align-objects/)
- [Astah — Class diagrams](https://astah.net/support/astah-pro/user-guide/class-diagrams/)
- [Astah — Drawing lines](https://astah.net/support/astah-pro/user-guide/draw-lines/)
- [Astah — Command-line tools](https://astah.net/support/astah-pro/user-guide/command-line-tools/)
