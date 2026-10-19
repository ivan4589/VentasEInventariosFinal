import { calculateBonusEntitlement, validateBonusAllocation } from './bonus-calculator';

const rule = { subCategoryId: 'fideos', minimumQuantity: 25, bonusQuantity: 1 };
const items = (quantity: number) => [{ productId: 'a', subCategoryId: 'fideos', quantity }];
const stock = [
  { id: 'a', subCategoryId: 'fideos', availableStock: 20 },
  { id: 'b', subCategoryId: 'fideos', availableStock: 20 },
  { id: 'x', subCategoryId: 'arroz', availableStock: 20 },
];

describe('bonus calculator', () => {
  it.each([[10,0],[24,0],[25,1],[30,1],[49,1],[50,2],[75,3],[100,4]])('calculates %i sold to %i gifts', (sold, gifts) => {
    expect(calculateBonusEntitlement(rule,items(sold))).toBe(gifts);
  });
  it('sums only products from the same subcategory', () => {
    expect(calculateBonusEntitlement(rule, [
      {productId:'a',subCategoryId:'fideos',quantity:10},
      {productId:'b',subCategoryId:'fideos',quantity:15},
      {productId:'x',subCategoryId:'arroz',quantity:80},
    ])).toBe(1);
  });
  it('supports configurable earning ratio', () => {
    expect(calculateBonusEntitlement({...rule,minimumQuantity:12,bonusQuantity:2},items(30))).toBe(4);
  });
  it('allows splitting gifts across multiple eligible products', () => {
    expect(() => validateBonusAllocation(rule,items(50),[
      {productId:'a',quantity:1},{productId:'b',quantity:1}
    ],stock)).not.toThrow();
  });
  it('combines duplicate gift lines when checking availability', () => {
    expect(() => validateBonusAllocation(rule,items(50),[
      {productId:'a',quantity:1},{productId:'a',quantity:1}
    ],[{id:'a',subCategoryId:'fideos',availableStock:1}])).toThrow(/Stock insuficiente/);
  });
  it('rejects another subcategory', () => {
    expect(() => validateBonusAllocation(rule,items(25),[{productId:'x',quantity:1}],stock)).toThrow(/subcategoría/);
  });
  it('rejects under- and over-allocation', () => {
    expect(() => validateBonusAllocation(rule,items(50),[{productId:'a',quantity:1}],stock)).toThrow(/corresponde 2/);
    expect(() => validateBonusAllocation(rule,items(25),[{productId:'a',quantity:2}],stock)).toThrow(/corresponde 1/);
  });
  it('rejects zero, fractional, and unsafe quantities', () => {
    expect(() => calculateBonusEntitlement(rule,items(0))).toThrow();
    expect(() => calculateBonusEntitlement(rule,items(1.5))).toThrow();
    expect(() => calculateBonusEntitlement({...rule,minimumQuantity:0},items(25))).toThrow();
    expect(() => calculateBonusEntitlement({...rule,bonusQuantity:1.5},items(25))).toThrow();
  });
});
