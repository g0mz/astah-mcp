# Guia de layout UML para Astah

Estas regras são aplicadas pelo gerador e pela verificação final do MCP. O foco é geometria, fluxo e legibilidade; cores são apenas neutras.

## Estrutura visual

1. Organize a leitura principal da esquerda para a direita ou, em fluxos comportamentais, de cima para baixo.
2. Coloque superclasses centralizadas acima das subclasses e mantenha elementos do mesmo nível na mesma linha.
3. Mantenha todos os elementos pedidos em um único diagrama; somente crie outra visão mediante solicitação explícita.
4. Calcule cada caixa pelo maior texto visível e use a menor largura que não corte o conteúdo.
5. Alinhe elementos do mesmo nível e preserve apenas o corredor mínimo seguro entre caixas ligadas.
6. Evite linhas ou textos sobre qualquer caixa, símbolo, atributo, operação ou mensagem.
7. Distribua elementos equivalentes simetricamente em torno do eixo da superclasse ou do módulo.

## Relacionamentos

1. Use verbos curtos, preferencialmente com até 20 caracteres.
2. Não nomeie generalizações: a seta triangular já comunica a relação UML.
3. Posicione cardinalidades junto aos extremos, sem concorrer com o nome da associação.
4. Use rotas ortogonais somente quando houver um corredor livre; em hierarquias, prefira um leque limpo.
5. Não aceite linhas coincidentes, cruzamentos desnecessários ou símbolos de salto.
6. Se duas relações disputarem o mesmo corredor, reposicione e compacte os elementos no mesmo diagrama.
7. Priorize um único segmento reto; quando for necessário desviar, use segmentos horizontais e verticais com ângulos de 90 graus.
8. Use diagonais somente em leques de generalização ou quando elas forem mais claras que uma rota ortogonal.

## Organização por tipo

- Classes e casos de uso: hierarquias verticais, elementos equivalentes alinhados e relações curtas.
- Estados e atividades: fluxo principal vertical, decisões centralizadas e rótulos fora dos símbolos.
- Sequência: linhas de vida igualmente espaçadas e mensagens em ordem temporal, sem diagonais.
- Estrutura composta: classes estruturadas alinhadas, portas nas bordas voltadas aos seus pares e corredor livre para conectores.
- Mapa mental: um tópico central e ramos equilibrados.
- Diagramas adicionais: somente quando forem pedidos explicitamente pelo usuário ou pelo enunciado.

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

- Nenhum elemento toca ou cobre outro.
- Cada nome de associação possui espaço em branco ao redor.
- Multiplicidades não encostam em nomes, setas ou caixas.
- Nenhuma linha atravessa um elemento ou texto.
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
