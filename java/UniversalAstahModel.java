import java.awt.geom.Point2D;
import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import com.change_vision.jude.api.inf.AstahAPI;
import com.change_vision.jude.api.inf.editor.ActivityDiagramEditor;
import com.change_vision.jude.api.inf.editor.BasicModelEditor;
import com.change_vision.jude.api.inf.editor.ClassDiagramEditor;
import com.change_vision.jude.api.inf.editor.CompositeStructureDiagramEditor;
import com.change_vision.jude.api.inf.editor.MindmapEditor;
import com.change_vision.jude.api.inf.editor.ModelEditorFactory;
import com.change_vision.jude.api.inf.editor.SequenceDiagramEditor;
import com.change_vision.jude.api.inf.editor.StateMachineDiagramEditor;
import com.change_vision.jude.api.inf.editor.StructureDiagramEditor;
import com.change_vision.jude.api.inf.editor.TransactionManager;
import com.change_vision.jude.api.inf.editor.UseCaseDiagramEditor;
import com.change_vision.jude.api.inf.editor.UseCaseModelEditor;
import com.change_vision.jude.api.inf.model.IAssociation;
import com.change_vision.jude.api.inf.model.IAttribute;
import com.change_vision.jude.api.inf.model.IClass;
import com.change_vision.jude.api.inf.model.IElement;
import com.change_vision.jude.api.inf.model.IEnumeration;
import com.change_vision.jude.api.inf.model.ILink;
import com.change_vision.jude.api.inf.model.IModel;
import com.change_vision.jude.api.inf.model.IMindMapDiagram;
import com.change_vision.jude.api.inf.model.INamedElement;
import com.change_vision.jude.api.inf.model.IOperation;
import com.change_vision.jude.api.inf.model.IPackage;
import com.change_vision.jude.api.inf.model.IUseCase;
import com.change_vision.jude.api.inf.presentation.ILinkPresentation;
import com.change_vision.jude.api.inf.presentation.INodePresentation;
import com.change_vision.jude.api.inf.project.ProjectAccessor;

/** Builds native Astah diagrams from the validated, data-driven MCP specification. */
public final class UniversalAstahModel {
    private static final class Node {
        String id, kind, name, parent, auxiliary;
        double x, y, width;
    }

    private static final class Member {
        String node, kind, name, type, parameters;
    }

    private static final class Link {
        String id, kind, source, target, label, sourceMultiplicity, targetMultiplicity, reference;
    }

    private static final class Diagram {
        String type, name;
        final List<Node> nodes = new ArrayList<>();
        final List<Member> members = new ArrayList<>();
        final List<Link> links = new ArrayList<>();
    }

    private static String decode(String value) {
        if (value == null || value.equals("-")) return "";
        return new String(Base64.getUrlDecoder().decode(value), StandardCharsets.UTF_8);
    }

    private static String field(String[] values, int index) {
        return index < values.length ? values[index] : "-";
    }

    private static List<Diagram> parse(File specification) throws Exception {
        List<Diagram> diagrams = new ArrayList<>();
        Diagram current = null;
        for (String raw : Files.readAllLines(specification.toPath(), StandardCharsets.UTF_8)) {
            if (raw.isBlank() || raw.startsWith("#")) continue;
            String[] values = raw.split("\\t", -1);
            switch (values[0]) {
                case "DIAGRAM":
                    current = new Diagram();
                    current.type = values[1];
                    current.name = decode(values[2]);
                    diagrams.add(current);
                    break;
                case "NODE": {
                    if (current == null) throw new IllegalArgumentException("NODE sem DIAGRAM.");
                    Node node = new Node();
                    node.id = decode(values[1]);
                    node.kind = values[2];
                    node.name = decode(values[3]);
                    node.x = Double.parseDouble(values[4]);
                    node.y = Double.parseDouble(values[5]);
                    node.parent = decode(field(values, 6));
                    node.width = Double.parseDouble(field(values, 7).equals("-") ? "0" : values[7]);
                    node.auxiliary = decode(field(values, 8));
                    current.nodes.add(node);
                    break;
                }
                case "MEMBER": {
                    if (current == null) throw new IllegalArgumentException("MEMBER sem DIAGRAM.");
                    Member member = new Member();
                    member.node = decode(values[1]);
                    member.kind = values[2];
                    member.name = decode(values[3]);
                    member.type = decode(field(values, 4));
                    member.parameters = decode(field(values, 5));
                    current.members.add(member);
                    break;
                }
                case "LINK": {
                    if (current == null) throw new IllegalArgumentException("LINK sem DIAGRAM.");
                    Link link = new Link();
                    link.id = decode(values[1]);
                    link.kind = values[2];
                    link.source = decode(values[3]);
                    link.target = decode(values[4]);
                    link.label = decode(field(values, 5));
                    link.sourceMultiplicity = decode(field(values, 6));
                    link.targetMultiplicity = decode(field(values, 7));
                    link.reference = decode(field(values, 8));
                    current.links.add(link);
                    break;
                }
                default:
                    throw new IllegalArgumentException("Registro desconhecido: " + values[0]);
            }
        }
        if (diagrams.isEmpty()) throw new IllegalArgumentException("A especificação não contém diagramas.");
        return diagrams;
    }

    private static Point2D point(Node node) {
        return new Point2D.Double(node.x, node.y);
    }

    private static void size(INodePresentation presentation, Node node) throws Exception {
        // Astah rejects widths below the semantic minimum of some presentations
        // (for example enumerations and objects). Never enlarge beyond the text-based
        // request unless Astah itself requires a larger native minimum.
        if (node.width > presentation.getWidth()) presentation.setWidth(node.width);
        presentation.setProperty("fill.color", "#F7F7F7");
    }

    private static void route(ILinkPresentation link) throws Exception {
        Point2D[] points = link.getPoints();
        if (points.length < 2) return;
        Point2D start = points[0];
        Point2D end = points[points.length - 1];
        double dx = Math.abs(start.getX() - end.getX());
        double dy = Math.abs(start.getY() - end.getY());
        if (dx < 8 || dy < 8) {
            link.setPoints(new Point2D[] { start, end });
        } else if (dx >= dy) {
            double middle = (start.getX() + end.getX()) / 2;
            link.setPoints(new Point2D[] { start, new Point2D.Double(middle, start.getY()), new Point2D.Double(middle, end.getY()), end });
        } else {
            double middle = (start.getY() + end.getY()) / 2;
            link.setPoints(new Point2D[] { start, new Point2D.Double(start.getX(), middle), new Point2D.Double(end.getX(), middle), end });
        }
    }

    private static void addMembers(BasicModelEditor model, Diagram spec, Map<String, IElement> elements) throws Exception {
        for (Member member : spec.members) {
            IElement element = elements.get(member.node);
            if (!(element instanceof IClass)) throw new IllegalArgumentException("Membro associado a elemento incompatível: " + member.node);
            IClass owner = (IClass) element;
            if (member.kind.equals("attribute")) {
                model.createAttribute(owner, member.name, member.type.isBlank() ? "String" : member.type);
            } else if (member.kind.equals("operation")) {
                IOperation operation = model.createOperation(owner, member.name, member.type.isBlank() ? "void" : member.type);
                if (!member.parameters.isBlank()) {
                    for (String parameter : member.parameters.split(",")) {
                        String[] parts = parameter.trim().split(":", 2);
                        model.createParameter(operation, parts[0].trim(), parts.length == 2 ? parts[1].trim() : "String");
                    }
                }
            } else if (member.kind.equals("literal") && owner instanceof IEnumeration) {
                model.createEnumerationLiteral((IEnumeration) owner, member.name);
            } else {
                throw new IllegalArgumentException("Tipo de membro não suportado: " + member.kind);
            }
        }
    }

    private static void buildClass(ProjectAccessor accessor, BasicModelEditor model, IPackage owner, Diagram spec) throws Exception {
        ClassDiagramEditor editor = accessor.getDiagramEditorFactory().getClassDiagramEditor();
        Map<String, IElement> elements = new LinkedHashMap<>();
        for (Node node : spec.nodes) {
            IElement element;
            switch (node.kind) {
                case "interface": element = model.createInterface(owner, node.name); break;
                case "enumeration": element = model.createEnumeration(owner, node.name); break;
                case "class":
                case "abstract_class":
                    IClass clazz = model.createClass(owner, node.name);
                    if (node.kind.equals("abstract_class")) clazz.setAbstract(true);
                    element = clazz;
                    break;
                case "object": element = null; break;
                default: throw new IllegalArgumentException("Elemento inválido no diagrama de classes: " + node.kind);
            }
            if (element != null) elements.put(node.id, element);
        }
        addMembers(model, spec, elements);
        editor.createClassDiagram(owner, spec.name);
        Map<String, INodePresentation> presentations = new LinkedHashMap<>();
        for (Node node : spec.nodes) {
            INodePresentation presentation;
            if (node.kind.equals("object")) {
                presentation = editor.createInstanceSpecification(node.name, node.auxiliary, point(node));
            } else {
                presentation = editor.createNodePresentation(elements.get(node.id), point(node));
            }
            size(presentation, node);
            presentations.put(node.id, presentation);
        }
        for (Link link : spec.links) {
            INodePresentation source = presentations.get(link.source);
            INodePresentation target = presentations.get(link.target);
            if (source == null || target == null) throw new IllegalArgumentException("Relação referencia elemento inexistente: " + link.id);
            if (link.kind.equals("object_link")) {
                ILinkPresentation presentation = editor.createInstanceSpecificationLink(source, target);
                presentation.setLabel(link.label);
                route(presentation);
                continue;
            }
            IClass sourceClass = (IClass) elements.get(link.source);
            IClass targetClass = (IClass) elements.get(link.target);
            IElement relation;
            switch (link.kind) {
                case "association":
                case "aggregation":
                case "composition": {
                    IAssociation association = model.createAssociation(sourceClass, targetClass, link.label, "", "");
                    IAttribute[] ends = association.getMemberEnds();
                    if (!link.sourceMultiplicity.isBlank()) ends[0].setMultiplicityString(link.sourceMultiplicity);
                    if (!link.targetMultiplicity.isBlank()) ends[1].setMultiplicityString(link.targetMultiplicity);
                    if (link.kind.equals("aggregation")) ends[0].setAggregation();
                    if (link.kind.equals("composition")) ends[0].setComposite();
                    relation = association;
                    break;
                }
                case "generalization": relation = model.createGeneralization(sourceClass, targetClass, link.label); break;
                case "realization": relation = model.createRealization(sourceClass, targetClass, link.label); break;
                case "usage": relation = model.createUsage(sourceClass, targetClass, link.label); break;
                case "dependency": relation = model.createDependency(sourceClass, targetClass, link.label); break;
                default: throw new IllegalArgumentException("Relação inválida no diagrama de classes: " + link.kind);
            }
            route(editor.createLinkPresentation(relation, source, target));
        }
    }

    private static void buildUseCase(ProjectAccessor accessor, BasicModelEditor model, IPackage owner, Diagram spec) throws Exception {
        UseCaseDiagramEditor editor = accessor.getDiagramEditorFactory().getUseCaseDiagramEditor();
        UseCaseModelEditor useCases = ModelEditorFactory.getUseCaseModelEditor();
        Map<String, IClass> elements = new LinkedHashMap<>();
        for (Node node : spec.nodes) {
            if (node.kind.equals("actor")) elements.put(node.id, useCases.createActor(owner, node.name));
            else if (node.kind.equals("use_case")) elements.put(node.id, useCases.createUseCase(owner, node.name));
            else throw new IllegalArgumentException("Elemento inválido no diagrama de casos de uso: " + node.kind);
        }
        editor.createUseCaseDiagram(owner, spec.name);
        Map<String, INodePresentation> presentations = new LinkedHashMap<>();
        for (Node node : spec.nodes) {
            INodePresentation presentation = editor.createNodePresentation(elements.get(node.id), point(node));
            size(presentation, node);
            presentations.put(node.id, presentation);
        }
        for (Link link : spec.links) {
            IClass source = elements.get(link.source);
            IClass target = elements.get(link.target);
            IElement relation;
            switch (link.kind) {
                case "association": relation = model.createAssociation(source, target, link.label, "", ""); break;
                case "generalization": relation = model.createGeneralization(source, target, link.label); break;
                case "include": relation = useCases.createInclude((IUseCase) source, (IUseCase) target, ""); break;
                case "extend": relation = useCases.createExtend((IUseCase) source, (IUseCase) target, ""); break;
                case "dependency": relation = model.createDependency(source, target, link.label); break;
                default: throw new IllegalArgumentException("Relação inválida no diagrama de casos de uso: " + link.kind);
            }
            route(editor.createLinkPresentation(relation, presentations.get(link.source), presentations.get(link.target)));
        }
    }

    private static INodePresentation parent(Map<String, INodePresentation> nodes, Node node) {
        return node.parent.isBlank() ? null : nodes.get(node.parent);
    }

    private static void buildStateMachine(ProjectAccessor accessor, IPackage owner, Diagram spec) throws Exception {
        StateMachineDiagramEditor editor = accessor.getDiagramEditorFactory().getStateMachineDiagramEditor();
        editor.createStatemachineDiagram(owner, spec.name);
        Map<String, INodePresentation> nodes = new LinkedHashMap<>();
        for (Node node : spec.nodes) {
            INodePresentation presentation;
            INodePresentation parent = parent(nodes, node);
            switch (node.kind) {
                case "state": presentation = editor.createState(node.name, parent, point(node)); break;
                case "initial": presentation = editor.createInitialPseudostate(parent, point(node)); break;
                case "final": presentation = editor.createFinalState(parent, point(node)); break;
                case "choice": presentation = editor.createChoicePseudostate(parent, point(node)); break;
                case "junction": presentation = editor.createJunctionPseudostate(parent, point(node)); break;
                case "fork": presentation = editor.createForkPseudostate(parent, point(node), Math.max(node.width, 90), 10); break;
                case "join": presentation = editor.createJoinPseudostate(parent, point(node), Math.max(node.width, 90), 10); break;
                case "shallow_history": presentation = editor.createShallowHistoryPseudostate(parent, point(node)); break;
                case "deep_history": presentation = editor.createDeepHistoryPseudostate(parent, point(node)); break;
                default: throw new IllegalArgumentException("Elemento inválido no diagrama de estados: " + node.kind);
            }
            if (node.kind.equals("state")) size(presentation, node);
            nodes.put(node.id, presentation);
        }
        for (Link link : spec.links) {
            ILinkPresentation transition = editor.createTransition(nodes.get(link.source), nodes.get(link.target));
            transition.setLabel(link.label);
            route(transition);
        }
    }

    private static void buildActivity(ProjectAccessor accessor, IPackage owner, Diagram spec) throws Exception {
        ActivityDiagramEditor editor = accessor.getDiagramEditorFactory().getActivityDiagramEditor();
        editor.createActivityDiagram(owner, spec.name);
        Map<String, INodePresentation> nodes = new LinkedHashMap<>();
        for (Node node : spec.nodes) {
            INodePresentation presentation;
            String requiredName = node.name.isBlank() ? node.id : node.name;
            switch (node.kind) {
                case "initial": presentation = editor.createInitialNode(requiredName, point(node)); break;
                case "final": presentation = editor.createFinalNode(requiredName, point(node)); break;
                case "flow_final": presentation = editor.createFlowFinalNode(requiredName, point(node)); break;
                case "action": presentation = editor.createAction(requiredName, point(node)); break;
                case "send_signal": presentation = editor.createSendSignalAction(requiredName, point(node)); break;
                case "accept_event": presentation = editor.createAcceptEventAction(requiredName, point(node)); break;
                case "accept_time": presentation = editor.createAcceptTimeEventAction(requiredName, point(node)); break;
                case "process": presentation = editor.createProcess(requiredName, point(node)); break;
                case "decision_merge": presentation = editor.createDecisionMergeNode(null, point(node)); break;
                case "fork": presentation = editor.createForkNode(null, point(node), Math.max(node.width, 90), 10); break;
                case "join": presentation = editor.createJoinNode(null, point(node), Math.max(node.width, 90), 10); break;
                case "connector": presentation = editor.createConnector(requiredName, point(node)); break;
                default: throw new IllegalArgumentException("Elemento inválido no diagrama de atividades: " + node.kind);
            }
            if (List.of("action", "send_signal", "accept_event", "accept_time", "process").contains(node.kind)) size(presentation, node);
            nodes.put(node.id, presentation);
        }
        for (Link link : spec.links) {
            ILinkPresentation flow = link.kind.equals("dependency")
                ? editor.createDependency(link.label, nodes.get(link.source), nodes.get(link.target))
                : editor.createFlow(nodes.get(link.source), nodes.get(link.target));
            if (!link.label.isBlank() && !link.kind.equals("dependency")) flow.setLabel(link.label);
            route(flow);
        }
    }

    private static void buildSequence(ProjectAccessor accessor, IPackage owner, Diagram spec) throws Exception {
        SequenceDiagramEditor editor = accessor.getDiagramEditorFactory().getSequenceDiagramEditor();
        editor.createSequenceDiagram(owner, spec.name);
        Map<String, INodePresentation> nodes = new LinkedHashMap<>();
        for (Node node : spec.nodes) {
            if (!node.kind.equals("lifeline")) throw new IllegalArgumentException("Elemento inválido no diagrama de sequência: " + node.kind);
            INodePresentation lifeline = editor.createLifeline(node.name, node.x);
            if (node.width > lifeline.getWidth()) lifeline.setWidth(node.width);
            nodes.put(node.id, lifeline);
        }
        Map<String, ILinkPresentation> messages = new LinkedHashMap<>();
        for (Link link : spec.links) {
            ILinkPresentation message;
            if (link.kind.equals("return")) {
                ILinkPresentation reference = messages.get(link.reference);
                if (reference == null) throw new IllegalArgumentException("Mensagem de retorno sem referência válida: " + link.id);
                message = editor.createReturnMessage(link.label, reference);
            } else {
                double y = link.sourceMultiplicity.isBlank() ? 100 : Double.parseDouble(link.sourceMultiplicity);
                switch (link.kind) {
                    case "message": message = editor.createMessage(link.label, nodes.get(link.source), nodes.get(link.target), y); break;
                    case "create": message = editor.createCreateMessage(link.label, nodes.get(link.source), nodes.get(link.target), y); break;
                    case "destroy": message = editor.createDestroyMessage(link.label, nodes.get(link.source), nodes.get(link.target), y); break;
                    default: throw new IllegalArgumentException("Mensagem inválida no diagrama de sequência: " + link.kind);
                }
            }
            messages.put(link.id, message);
        }
    }

    private static void buildComposite(ProjectAccessor accessor, BasicModelEditor model, IPackage owner, Diagram spec) throws Exception {
        CompositeStructureDiagramEditor editor = accessor.getDiagramEditorFactory().getCompositeStructureDiagramEditor();
        Map<String, IClass> elements = new LinkedHashMap<>();
        for (Node node : spec.nodes) {
            if (node.kind.equals("structured_class")) elements.put(node.id, model.createClass(owner, node.name));
        }
        editor.createCompositeStructureDiagram(owner, spec.name);
        Map<String, INodePresentation> nodes = new LinkedHashMap<>();
        for (Node node : spec.nodes) {
            INodePresentation presentation;
            if (node.kind.equals("structured_class")) {
                presentation = editor.createStructuredClassPresentation(elements.get(node.id), point(node));
                size(presentation, node);
            } else if (node.kind.equals("port")) {
                INodePresentation parent = nodes.get(node.parent);
                if (parent == null) throw new IllegalArgumentException("Porta sem classe estruturada válida: " + node.id);
                presentation = editor.createPortPresentation(parent, node.name, node.auxiliary, point(node));
            } else {
                throw new IllegalArgumentException("Elemento inválido no diagrama de estrutura composta: " + node.kind);
            }
            nodes.put(node.id, presentation);
        }
        for (Link link : spec.links) {
            ILinkPresentation connector = editor.createConnectorPresentation(nodes.get(link.source), nodes.get(link.target), link.label);
            route(connector);
        }
    }

    private static void buildMindmap(ProjectAccessor accessor, IPackage owner, Diagram spec) throws Exception {
        MindmapEditor editor = accessor.getDiagramEditorFactory().getMindmapEditor();
        IMindMapDiagram mindmap = editor.createMindmapDiagram(owner, spec.name);
        Map<String, INodePresentation> nodes = new LinkedHashMap<>();
        List<Node> pending = new ArrayList<>(spec.nodes);
        Node central = null;
        for (Node node : pending) {
            if (node.parent.isBlank()) { central = node; break; }
        }
        if (central != null) {
            INodePresentation root = mindmap.getRoot();
            root.setLabel(central.name);
            nodes.put(central.id, root);
            pending.remove(central);
        }
        while (!pending.isEmpty()) {
            int before = pending.size();
            for (int i = pending.size() - 1; i >= 0; i--) {
                Node node = pending.get(i);
                if (!node.parent.isBlank() && !nodes.containsKey(node.parent)) continue;
                INodePresentation presentation = node.parent.isBlank()
                    ? editor.createFloatingTopic(node.name, point(node))
                    : editor.createTopic(nodes.get(node.parent), node.name);
                nodes.put(node.id, presentation);
                pending.remove(i);
            }
            if (pending.size() == before) throw new IllegalArgumentException("Há tópicos com pais inexistentes ou cíclicos.");
        }
        for (Link link : spec.links) {
            editor.createMMLinkPresentation(nodes.get(link.source), nodes.get(link.target));
        }
    }

    private static void build(ProjectAccessor accessor, BasicModelEditor model, IModel project, Diagram spec, int index) throws Exception {
        IPackage owner = model.createPackage(project, String.format("%02d - %s", index + 1, spec.name));
        switch (spec.type) {
            case "class": buildClass(accessor, model, owner, spec); break;
            case "use_case": buildUseCase(accessor, model, owner, spec); break;
            case "state_machine": buildStateMachine(accessor, owner, spec); break;
            case "activity": buildActivity(accessor, owner, spec); break;
            case "sequence": buildSequence(accessor, owner, spec); break;
            case "composite_structure": buildComposite(accessor, model, owner, spec); break;
            case "mindmap": buildMindmap(accessor, owner, spec); break;
            default: throw new IllegalArgumentException("Tipo de diagrama não suportado pela API desta edição do Astah: " + spec.type);
        }
    }

    public static void main(String[] args) {
        if (args.length != 2) {
            System.err.println("Uso: UniversalAstahModel <especificacao.tsv> <arquivo.asta>");
            System.exit(2);
        }
        ProjectAccessor accessor = null;
        try {
            File specification = new File(args[0]).getAbsoluteFile();
            File output = new File(args[1]).getAbsoluteFile();
            File parent = output.getParentFile();
            if (parent != null) parent.mkdirs();
            List<Diagram> diagrams = parse(specification);
            accessor = AstahAPI.getAstahAPI().getProjectAccessor();
            accessor.create(output.getPath());
            IModel project = accessor.getProject();
            TransactionManager.beginTransaction();
            BasicModelEditor model = ModelEditorFactory.getBasicModelEditor();
            for (int i = 0; i < diagrams.size(); i++) build(accessor, model, project, diagrams.get(i), i);
            TransactionManager.endTransaction();
            accessor.save();
            accessor.close();
            System.out.println("Projeto criado em: " + output.getPath() + " (" + diagrams.size() + " diagrama(s)).");
        } catch (Throwable error) {
            try { TransactionManager.abortTransaction(); } catch (Throwable ignored) { }
            try { if (accessor != null) accessor.close(); } catch (Throwable ignored) { }
            error.printStackTrace();
            System.exit(1);
        }
    }
}
