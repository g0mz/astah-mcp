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

- Classes: hierarquias verticais, elementos equivalentes alinhados e relações curtas. Sem herança, o diagrama se organiza em volta da classe com mais relações: associadas e dependentes à esquerda e à direita, centralizadas na altura dela, a 150 px, para caber o nome e as multiplicidades; partes de composição e agregação numa linha abaixo, simétrica ao eixo dela; enumerações e classes soltas numa última linha centralizada e alinhada pelo topo.
- Duas caixas que dividem uma faixa comum são ligadas por uma linha reta no meio dessa faixa. Na vertical, isso só vale para relações sem nome, porque o Astah centraliza o nome sobre a linha.
- Casos de uso: ver a seção própria abaixo.
- Estados e atividades: fluxo principal vertical, decisões centralizadas e rótulos fora dos símbolos.
- Sequência: linhas de vida igualmente espaçadas e mensagens em ordem temporal, sem diagonais.
- Estrutura composta: classes estruturadas alinhadas, portas nas bordas voltadas aos seus pares e corredor livre para conectores.
- Mapa mental: um tópico central e ramos equilibrados.
- Diagramas adicionais: somente quando forem pedidos explicitamente pelo usuário ou pelo enunciado.

## Casos de uso

O arranjo segue as diretrizes de Scott Ambler e é aplicado automaticamente quando as posições são omitidas.

1. Os casos de uso formam uma única coluna, empilhados na ordem em que acontecem (os primeiros ficam acima).
2. Os dois atores com mais associações são os primários e ficam à esquerda, um abaixo do outro, cada um na altura média dos seus casos. Os grupos de casos de cada ator ficam separados por um pequeno respiro.
3. Os demais atores (sistemas externos) ficam à direita, na altura média dos seus casos. Se alguma linha cortar uma elipse, o ator desce ou sobe até a altura de um dos casos ligados a ele.
4. Especializações de um ator ficam numa linha logo abaixo do ator pai, em leque.
5. Incluídos e extensões ficam na mesma linha do caso base, numa faixa à direita. A seta é horizontal porque o Astah centraliza o estereótipo sobre a linha: na vertical o tracejado corta o texto, na horizontal o rótulo fica acima dele.
6. Na especificação, `include` vai do caso base ao incluído e `extend` vai da extensão ao caso base, como na UML. O gerador converte para a ordem de argumentos da API.
7. Todas as relações são retas, em leque. Cotovelos ortogonais fazem as associações de um mesmo ator dividirem o mesmo corredor e geram símbolos de salto.
8. As linhas chegam às extremidades das elipses: pela ponta lateral, quando vêm de um ator, e pelo topo ou pela base, entre casos empilhados. Na exportação o Astah recorta a linha na caixa retangular do caso de uso, e só nas extremidades a caixa e a elipse coincidem.
9. Toda elipse tem 42 px de altura e largura calculada pelo nome, sem quebra de linha. O passo vertical é de 58 px, a faixa de dependentes fica a 90 px do caso base e os atores ficam a pelo menos 130 px da coluna (40% da altura da pilha, quando ela for maior).
10. Não há moldura de sistema: o próprio diagrama do Astah já delimita o escopo, e uma moldura sem significado é desaconselhada.

## Atividades e estados

Aplicado automaticamente quando nenhuma posição é informada e não há nós aninhados.

1. Cada nó desce para a camada seguinte à do seu predecessor mais distante. Cada camada tem a altura do seu nó mais alto, mais 52 px de respiro para a seta e a guarda.
2. O caminho principal é a primeira saída de cada nó, na ordem dos links, e fica na coluna central. Por isso, liste primeiro a saída principal de cada decisão.
3. Cada saída extra de uma decisão ganha uma coluna lateral, e o ramo volta à coluna central na junção.
4. A seta de um ramo sai pela lateral da decisão e desce até o nó. A seta de volta desce do nó e entra pela lateral da junção.
5. Laços de retorno sobem por um corredor externo à direita, a 30 px do nó mais largo, sem atravessar nenhum nó. Os ramos laterais são explorados antes do principal, e assim o retorno identificado é a última aresta do laço.
6. Nós quase alinhados (diferença menor que 8 px) recebem uma seta perfeitamente vertical ou horizontal.
7. Limite da API: o Astah centraliza a guarda sobre a seta e não permite mover o rótulo. Em setas verticais, a linha passa pelo texto. Quando isso incomodar, arraste o rótulo no próprio Astah.

## Compactação

1. Use a menor distância que ainda deixa rótulos, setas e multiplicidades livres. Espaço só existe para separar elementos ou abrir corredor para uma linha.
2. Em diagramas de classes, 70 px entre caixas da mesma linha e 70 px de vão livre entre linhas. Cada linha tem a altura estimada da sua caixa mais alta (cabeçalho de 26 px, ou 41 com estereótipo, e 15 px por atributo, operação ou literal), e assim uma classe grande não invade a linha de baixo.
3. Quando uma relação precisa dobrar, a dobra fica no meio do vão entre as bordas das caixas, e não no ponto médio entre os centros, que numa caixa alta cai dentro dela.
4. Em fluxos verticais, o layout define o centro de cada nó, e o gerador centraliza cada símbolo nesse eixo. Início, ações, decisões e fim ficam alinhados, e as setas saem retas.
5. A moldura do Astah tem um tamanho mínimo nativo (cerca de 640 x 480) e não pode ser reduzida pela API. Em diagramas pequenos esse vazio é inevitável; nos demais, a moldura acompanha o conteúdo.

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

## Referências

- [Scott Ambler — UML 2 Use Case Diagramming Guidelines](http://agilemodeling.com/style/useCaseDiagram.htm)

- [Astah — Layout and align objects](https://astah.net/support/astah-pro/user-guide/layout-align-objects/)
- [Astah — Class diagrams](https://astah.net/support/astah-pro/user-guide/class-diagrams/)
- [Astah — Drawing lines](https://astah.net/support/astah-pro/user-guide/draw-lines/)
- [Astah — Command-line tools](https://astah.net/support/astah-pro/user-guide/command-line-tools/)
