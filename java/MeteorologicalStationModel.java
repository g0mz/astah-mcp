import java.awt.geom.Point2D;
import java.io.File;
import java.util.LinkedHashMap;
import java.util.Map;

import com.change_vision.jude.api.inf.AstahAPI;
import com.change_vision.jude.api.inf.editor.BasicModelEditor;
import com.change_vision.jude.api.inf.editor.ClassDiagramEditor;
import com.change_vision.jude.api.inf.editor.ModelEditorFactory;
import com.change_vision.jude.api.inf.editor.TransactionManager;
import com.change_vision.jude.api.inf.model.IAssociation;
import com.change_vision.jude.api.inf.model.IAttribute;
import com.change_vision.jude.api.inf.model.IClass;
import com.change_vision.jude.api.inf.model.IGeneralization;
import com.change_vision.jude.api.inf.model.IModel;
import com.change_vision.jude.api.inf.model.IPackage;
import com.change_vision.jude.api.inf.presentation.INodePresentation;
import com.change_vision.jude.api.inf.presentation.ILinkPresentation;
import com.change_vision.jude.api.inf.project.ProjectAccessor;

/** Gera os diagramas solicitados no exercício de estação meteorológica. */
public final class MeteorologicalStationModel {
    private static BasicModelEditor model;
    private static ClassDiagramEditor diagram;
    private static final Map<IClass, Double> compactWidths = new LinkedHashMap<>();

    /**
     * Calcula uma largura enxuta pelo maior texto visível da classe. A margem e o
     * fator por caractere foram calibrados para a fonte padrão do Astah: evitam
     * cortes sem deixar todas as caixas com a largura da maior classe do modelo.
     */
    private static double textWidth(String text) {
        return Math.max(120.0, 28.0 + text.length() * 6.4);
    }

    private static void rememberWidth(IClass c, String text) {
        compactWidths.put(c, Math.max(compactWidths.getOrDefault(c, 120.0), textWidth(text)));
    }

    private static IClass clazz(IPackage p, String name, String... attributes) throws Exception {
        IClass c = model.createClass(p, name);
        rememberWidth(c, name);
        for (String a : attributes) {
            String[] parts = a.split(":", 2);
            model.createAttribute(c, parts[0], parts.length == 2 ? parts[1] : "String");
            rememberWidth(c, "- " + parts[0] + " : " + (parts.length == 2 ? parts[1] : "String"));
        }
        return c;
    }

    private static void operation(IClass c, String signature) throws Exception {
        String[] parts = signature.split(":", 2);
        model.createOperation(c, parts[0], parts.length == 2 ? parts[1] : "void");
        rememberWidth(c, "+ " + parts[0] + "() : " + (parts.length == 2 ? parts[1] : "void"));
    }

    private static final class Relation {
        final IAssociation association; final IClass left; final IClass right;
        Relation(IAssociation association, IClass left, IClass right) { this.association = association; this.left = left; this.right = right; }
    }

    private static Relation relation(IClass a, IClass b, String name, String leftMultiplicity, String rightMultiplicity, String wholeKind) throws Exception {
        IAssociation association = model.createAssociation(a, b, name, "", "");
        IAttribute[] ends = association.getMemberEnds();
        ends[0].setMultiplicityString(leftMultiplicity);
        ends[1].setMultiplicityString(rightMultiplicity);
        if ("aggregate".equals(wholeKind)) ends[0].setAggregation();
        if ("composite".equals(wholeKind)) ends[0].setComposite();
        return new Relation(association, a, b);
    }

    private static INodePresentation node(IClass c, double x, double y, String color) throws Exception {
        INodePresentation presentation = diagram.createNodePresentation(c, new Point2D.Double(x, y));
        presentation.setWidth(compactWidths.getOrDefault(c, 120.0));
        presentation.setProperty("fill.color", color);
        return presentation;
    }

    private static void link(Object modelLink, INodePresentation source, INodePresentation target) throws Exception {
        ILinkPresentation presentation;
        boolean association = modelLink instanceof IAssociation;
        if (association) presentation = diagram.createLinkPresentation((IAssociation) modelLink, source, target);
        else presentation = diagram.createLinkPresentation((IGeneralization) modelLink, source, target);
        Point2D[] original = presentation.getPoints();
        if (original.length < 2) return;

        Point2D start = original[0];
        Point2D end = original[original.length - 1];
        double dx = Math.abs(start.getX() - end.getX());
        double dy = Math.abs(start.getY() - end.getY());
        double nodeDx = Math.abs(source.getLocation().getX() - target.getLocation().getX());
        double nodeDy = Math.abs(source.getLocation().getY() - target.getLocation().getY());

        // A posição das caixas define o eixo visual. Isso elimina pequenos
        // "degraus" causados por classes da mesma fileira terem alturas diferentes.
        if (association && nodeDy < 8.0) {
            double alignedY = (start.getY() + end.getY()) / 2.0;
            presentation.setPoints(new Point2D[] {
                new Point2D.Double(start.getX(), alignedY),
                new Point2D.Double(end.getX(), alignedY)
            });
            return;
        }
        if (association && nodeDx < 120.0) {
            double alignedX = (start.getX() + end.getX()) / 2.0;
            presentation.setPoints(new Point2D[] {
                new Point2D.Double(alignedX, start.getY()),
                new Point2D.Double(alignedX, end.getY())
            });
            return;
        }

        // Alinhamentos de mesma linha ou coluna ficam rigorosamente retos.
        // Generalizações também usam um único segmento, preservando o leque simétrico.
        if (!association || dx < 8.0 || dy < 8.0) {
            presentation.setPoints(new Point2D[] { start, end });
            return;
        }

        // Quando uma associação precisa mudar de direção, use somente ângulos de 90 graus.
        // O eixo dominante escolhe o corredor mais curto e mantém o desenho alinhado à grade.
        if (dx >= dy) {
            double middleX = (start.getX() + end.getX()) / 2.0;
            presentation.setPoints(new Point2D[] {
                start, new Point2D.Double(middleX, start.getY()),
                new Point2D.Double(middleX, end.getY()), end
            });
        } else {
            double middleY = (start.getY() + end.getY()) / 2.0;
            presentation.setPoints(new Point2D[] {
                start, new Point2D.Double(start.getX(), middleY),
                new Point2D.Double(end.getX(), middleY), end
            });
        }
    }

    public static void main(String[] args) {
        if (args.length < 1 || args.length > 2) {
            System.err.println("Uso: MeteorologicalStationModel <arquivo.asta> [domain|compact]");
            System.exit(2);
        }
        try {
            File output = new File(args[0]).getAbsoluteFile();
            String layoutProfile = args.length == 2 ? args[1] : "domain";
            File parent = output.getParentFile();
            if (parent != null) parent.mkdirs();

            ProjectAccessor projectAccessor = AstahAPI.getAstahAPI().getProjectAccessor();
            projectAccessor.create(output.getPath());
            IModel project = projectAccessor.getProject();
            TransactionManager.beginTransaction();
            model = ModelEditorFactory.getBasicModelEditor();
            diagram = projectAccessor.getDiagramEditorFactory().getClassDiagramEditor();

            // Modelo conceitual: conceitos sem atributos ou métodos.
            IPackage conceptual = model.createPackage(project, "Modelo Conceitual");
            Map<String, IClass> concept = new LinkedHashMap<>();
            for (String name : new String[] {"Regiao de Monitoramento", "Estacao Meteorologica", "Sensor", "Medicao", "Tecnico", "Atendimento", "Cliente", "Contrato", "Usuario"}) {
                concept.put(name, clazz(conceptual, name));
            }
            Relation[] conceptualRelations = {
                relation(concept.get("Regiao de Monitoramento"), concept.get("Estacao Meteorologica"), "possui", "1", "1..*", "aggregate"),
                relation(concept.get("Estacao Meteorologica"), concept.get("Sensor"), "e composta por", "1", "1..*", "composite"),
                relation(concept.get("Sensor"), concept.get("Medicao"), "gera", "1", "0..*", "composite"),
                relation(concept.get("Tecnico"), concept.get("Atendimento"), "executa", "1", "0..*", "none"),
                relation(concept.get("Atendimento"), concept.get("Estacao Meteorologica"), "atende", "0..*", "1", "none"),
                relation(concept.get("Cliente"), concept.get("Contrato"), "celebra", "1", "0..*", "none"),
                relation(concept.get("Contrato"), concept.get("Regiao de Monitoramento"), "cobre", "0..*", "1", "none")
            };

            diagram.createClassDiagram(conceptual, "Modelo Conceitual");
            double[][] pos = "compact".equals(layoutProfile)
                ? new double[][] {{250,30},{500,30},{750,30},{980,30},{500,260},{750,260},{20,260},{250,260},{980,260}}
                : new double[][] {{300,40},{600,40},{900,40},{1180,40},{600,320},{900,320},{30,320},{300,320},{1180,320}};
            int i = 0;
            Map<IClass, INodePresentation> conceptualNodes = new LinkedHashMap<>();
            for (IClass c : concept.values()) conceptualNodes.put(c, node(c, pos[i][0], pos[i++][1], "#F7F7F7"));
            for (Relation r : conceptualRelations) link(r.association, conceptualNodes.get(r.left), conceptualNodes.get(r.right));

            // Diagrama de classes: modelo implementável e responsabilidades.
            IPackage detailed = model.createPackage(project, "Modelo Detalhado");
            IClass regiao = clazz(detailed, "RegiaoMonitoramento", "nome:String", "descricao:String", "responsavelTecnico:String");
            IClass estacao = clazz(detailed, "EstacaoMeteorologica", "codigo:String", "dataInstalacao:Date", "situacao:SituacaoEstacao", "latitude:double", "longitude:double", "altitude:double");
            operation(estacao, "podeEntrarEmOperacao:boolean");
            IClass sensor = clazz(detailed, "Sensor", "numeroSerie:String", "dataUltimaCalibracao:Date", "fabricante:String", "situacao:SituacaoSensor");
            sensor.setAbstract(true);
            operation(sensor, "registrarMedicao:void");
            IClass temp = clazz(detailed, "SensorTemperatura", "faixaMinima:double", "faixaMaxima:double");
            IClass umidade = clazz(detailed, "SensorUmidade");
            IClass pressao = clazz(detailed, "SensorPressaoAtmosferica");
            IClass vento = clazz(detailed, "SensorVento", "unidadeVelocidade:String");
            IClass direcaoVento = clazz(detailed, "SensorDirecaoVento");
            IClass pluviometro = clazz(detailed, "SensorPluviometrico", "capacidadeMaximaColeta:double");
            IClass medicao = clazz(detailed, "Medicao", "dataHora:DateTime", "valor:double", "qualidade:QualidadeLeitura");
            IClass tecnico = clazz(detailed, "Tecnico", "matricula:String", "nome:String", "telefone:String", "email:String", "especialidade:String", "dataAdmissao:Date");
            IClass atendimento = clazz(detailed, "Atendimento", "dataAbertura:Date", "dataConclusao:Date", "descricaoProblema:String", "servicosExecutados:String", "situacao:SituacaoAtendimento");
            operation(atendimento, "concluir:void");
            IClass cliente = clazz(detailed, "Cliente", "razaoSocial:String", "cnpj:String", "endereco:String", "telefone:String", "email:String");
            IClass contrato = clazz(detailed, "Contrato", "numero:String", "dataInicio:Date", "dataTermino:Date", "valorMensal:double", "situacao:SituacaoContrato");
            IClass usuario = clazz(detailed, "Usuario", "identificacao:String", "nome:String", "login:String", "senha:String", "dataUltimoAcesso:DateTime");
            usuario.setAbstract(true);
            IClass administrador = clazz(detailed, "Administrador");
            IClass operador = clazz(detailed, "Operador");

            Relation[] detailedRelations = {
                relation(regiao, estacao, "possui", "1", "1..*", "aggregate"),
                relation(estacao, sensor, "instala", "1", "1..*", "composite"),
                relation(sensor, medicao, "registra", "1", "0..*", "composite"),
                relation(tecnico, atendimento, "executa", "1", "0..*", "none"),
                relation(atendimento, estacao, "ocorre em", "0..*", "1", "none"),
                relation(cliente, contrato, "possui", "1", "0..*", "none"),
                relation(contrato, regiao, "cobre", "0..*", "1", "none")
            };
            IGeneralization[] generalizations = {
                model.createGeneralization(temp, sensor, ""), model.createGeneralization(umidade, sensor, ""),
                model.createGeneralization(pressao, sensor, ""), model.createGeneralization(vento, sensor, ""),
                model.createGeneralization(direcaoVento, sensor, ""), model.createGeneralization(pluviometro, sensor, ""), model.createGeneralization(administrador, usuario, ""),
                model.createGeneralization(operador, usuario, ""), model.createGeneralization(tecnico, usuario, "")
            };

            // Um único diagrama detalhado: fluxo principal no topo, hierarquias compactadas abaixo.
            // Nenhuma visão auxiliar é criada apenas por falta de espaço.
            diagram.createClassDiagram(detailed, "Diagrama de Classes - Dominio");
            IClass[] classes = {
                cliente, contrato, regiao, estacao, sensor, medicao,
                usuario, administrador, operador, tecnico, atendimento,
                temp, umidade, pressao, vento, direcaoVento, pluviometro
            };
            double[][] detailedPositions = "compact".equals(layoutProfile)
                ? new double[][] {
                    {20,30},{210,30},{420,30},{680,30},{1250,30},{1510,30},
                    {270,330},{20,610},{250,610},{470,610},{720,610},
                    {1040,330},{1230,330},{1410,330},{1620,330},{1890,330},{2100,330}
                }
                : new double[][] {
                    {30,40},{260,40},{520,40},{830,40},{1500,40},{1820,40},
                    {330,390},{30,730},{300,730},{520,730},{780,730},
                    {1120,400},{1310,400},{1490,400},{1700,400},{1980,400},{2200,400}
                };
            Map<IClass, INodePresentation> detailedNodes = new LinkedHashMap<>();
            for (i = 0; i < classes.length; i++) {
                detailedNodes.put(classes[i], node(classes[i], detailedPositions[i][0], detailedPositions[i][1], "#F7F7F7"));
            }
            for (Relation r : detailedRelations) link(r.association, detailedNodes.get(r.left), detailedNodes.get(r.right));
            IClass[] sensorChildren = {temp, umidade, pressao, vento, direcaoVento, pluviometro};
            for (i = 0; i < sensorChildren.length; i++) {
                link(generalizations[i], detailedNodes.get(sensor), detailedNodes.get(sensorChildren[i]));
            }
            IClass[] userChildren = {administrador, operador, tecnico};
            for (i = 0; i < userChildren.length; i++) {
                link(generalizations[i + sensorChildren.length], detailedNodes.get(usuario), detailedNodes.get(userChildren[i]));
            }

            TransactionManager.endTransaction();
            projectAccessor.save();
            projectAccessor.close();
            System.out.println("Projeto criado em: " + output.getPath());
        } catch (Throwable error) {
            try { TransactionManager.abortTransaction(); } catch (Throwable ignored) { }
            error.printStackTrace();
            System.exit(1);
        }
    }
}
