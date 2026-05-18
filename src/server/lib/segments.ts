/**
 * Pré-configurações por segmento de negócio.
 * Usado no onboarding para popular categorias financeiras default + sugerir
 * produtos iniciais. O dono pode editar tudo depois.
 */

export type SegmentKey =
  | "delivery"
  | "alimentacao"
  | "barbearia"
  | "beleza"
  | "estetica"
  | "loja"
  | "servico"
  | "outro";

export const SEGMENT_LABELS: Record<SegmentKey, string> = {
  delivery: "Delivery",
  alimentacao: "Alimentação",
  barbearia: "Barbearia",
  beleza: "Beleza",
  estetica: "Estética",
  loja: "Loja local",
  servico: "Serviço autônomo",
  outro: "Outro",
};

type ProductSuggestion = {
  name: string;
  type: "product" | "service";
  defaultPriceCents: number;
  aliases: string[];
};

const DEFAULT_INCOME_CATEGORIES = [
  "Venda de produto",
  "Prestação de serviço",
  "Delivery",
  "Atendimento presencial",
  "Recorrência",
  "Outros",
];

const DEFAULT_EXPENSE_CATEGORIES = [
  "Insumos",
  "Mercadoria",
  "Aluguel",
  "Energia",
  "Água",
  "Internet",
  "Taxas",
  "Salários",
  "Transporte",
  "Marketing",
  "Equipamentos",
  "Manutenção",
  "Impostos",
  "Outros",
];

export function defaultCategoriesFor(_segment: SegmentKey): {
  income: string[];
  expense: string[];
} {
  void _segment;
  return { income: DEFAULT_INCOME_CATEGORIES, expense: DEFAULT_EXPENSE_CATEGORIES };
}

export function suggestedProductsFor(segment: SegmentKey): ProductSuggestion[] {
  switch (segment) {
    case "delivery":
      return [
        { name: "Marmita", type: "product", defaultPriceCents: 2000, aliases: ["quentinha", "marmitex"] },
        { name: "Lanche", type: "product", defaultPriceCents: 1800, aliases: ["sanduiche", "x"] },
        { name: "Bebida", type: "product", defaultPriceCents: 500, aliases: ["refri", "suco"] },
        { name: "Taxa de entrega", type: "service", defaultPriceCents: 500, aliases: ["frete"] },
      ];
    case "alimentacao":
      return [
        { name: "Marmita", type: "product", defaultPriceCents: 2000, aliases: ["quentinha"] },
        { name: "Lanche", type: "product", defaultPriceCents: 1800, aliases: ["x"] },
        { name: "Bebida", type: "product", defaultPriceCents: 500, aliases: ["refri"] },
        { name: "Sobremesa", type: "product", defaultPriceCents: 800, aliases: [] },
      ];
    case "barbearia":
      return [
        { name: "Corte", type: "service", defaultPriceCents: 4000, aliases: ["cabelo"] },
        { name: "Barba", type: "service", defaultPriceCents: 3000, aliases: [] },
        { name: "Corte + Barba", type: "service", defaultPriceCents: 6000, aliases: ["combo"] },
      ];
    case "beleza":
      return [
        { name: "Corte", type: "service", defaultPriceCents: 7000, aliases: [] },
        { name: "Escova", type: "service", defaultPriceCents: 5000, aliases: [] },
        { name: "Unha", type: "service", defaultPriceCents: 4000, aliases: ["manicure"] },
        { name: "Sobrancelha", type: "service", defaultPriceCents: 3000, aliases: ["design"] },
      ];
    case "estetica":
      return [
        { name: "Limpeza de pele", type: "service", defaultPriceCents: 12000, aliases: [] },
        { name: "Avaliação", type: "service", defaultPriceCents: 0, aliases: [] },
        { name: "Procedimento", type: "service", defaultPriceCents: 25000, aliases: [] },
      ];
    case "loja":
      return [
        { name: "Produto avulso", type: "product", defaultPriceCents: 0, aliases: [] },
        { name: "Pedido", type: "product", defaultPriceCents: 0, aliases: [] },
        { name: "Entrega", type: "service", defaultPriceCents: 500, aliases: ["frete"] },
      ];
    case "servico":
      return [{ name: "Serviço avulso", type: "service", defaultPriceCents: 0, aliases: [] }];
    case "outro":
    default:
      return [];
  }
}
