export const num = (v, min = 0, max = 1e9) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : min));
export function defaults(p) {
  return {price:p.price, fees:8, works:p.works, contingency:15, furniture:p.area>35?5000:4000, startup:1500,
    rent:p.rent, vacancy:5, management:7, gli:2.5, maintenance:5, tax:p.tax??650, condo:p.ownerCharges??250, pno:120, cfe:180, accounting:400,
    mode:'annual', nightly:p.area>35?95:70, nights:140, platform:15, concierge:20, utilities:1500, cleaning:0,
    loan:0, years:20, rate:3.6, insurance:0.3, resale:0, sellingFees:5, months:3, scenario:'base'};
}
export const numericLimits = {price:[1,1e7],fees:[0,20],works:[0,1e7],contingency:[0,100],furniture:[0,1e6],startup:[0,1e6],rent:[0,100000],vacancy:[0,100],management:[0,100],gli:[0,100],maintenance:[0,100],tax:[0,1e6],condo:[0,1e6],pno:[0,1e5],cfe:[0,1e5],accounting:[0,1e5],nightly:[0,10000],nights:[0,365],platform:[0,100],concierge:[0,100],utilities:[0,1e6],cleaning:[0,1e6],loan:[0,1e7],years:[1,35],rate:[0,25],insurance:[0,10],resale:[0,1e8],sellingFees:[0,30],months:[0,12]};
export function sanitize(input, fallback) {
  const s={...fallback};
  for (const [k,[min,max]] of Object.entries(numericLimits)) if (input[k] !== undefined) s[k]=num(input[k],min,max);
  if (['annual','seasonal'].includes(input.mode)) s.mode=input.mode;
  if (['base','cautious','optimistic'].includes(input.scenario)) s.scenario=input.scenario;
  return s;
}
export function calculate(input) {
  const s=sanitize(input,defaults({price:1,works:0,rent:0,area:0}));
  const scenario=s.scenario || 'base';
  const cautious=scenario==='cautious', optimistic=scenario==='optimistic';
  const works=s.works*(cautious?1.2:1);
  const fees=s.price*s.fees/100, reserve=works*s.contingency/100;
  const total=s.price+fees+works+reserve+s.furniture+s.startup;
  const rent=s.rent*(cautious?.9:optimistic?1.1:1);
  const vacancy=cautious?Math.max(s.vacancy,10):optimistic?Math.min(s.vacancy,3):s.vacancy;
  const nights=Math.min(365,Math.max(0,s.nights*(cautious?.8:optimistic?1.15:1)));
  const seasonal=s.mode==='seasonal';
  const potential=seasonal?s.nightly*nights:rent*12;
  const lost=seasonal?0:potential*vacancy/100;
  const collected=potential-lost;
  const management=collected*(seasonal?s.concierge:s.management)/100;
  const distribution=seasonal?collected*s.platform/100:0;
  const gli=seasonal?0:collected*s.gli/100;
  const maintenance=potential*s.maintenance/100;
  const fixed=s.tax+s.condo+s.pno+s.cfe+s.accounting;
  const seasonalCosts=seasonal?s.utilities+s.cleaning:0;
  const expenses=management+distribution+gli+maintenance+fixed+seasonalCosts;
  const net=collected-expenses;
  const loan=Math.min(s.loan,total), monthlyRate=s.rate/1200, count=Math.round(s.years*12);
  const payment=loan===0?0:monthlyRate===0?loan/count:loan*monthlyRate/(1-Math.pow(1+monthlyRate,-count));
  const insurance=loan*s.insurance/100;
  const debt=payment*12+insurance;
  const equity=total-loan;
  const cash=net-debt;
  const firstYear=collected*(12-s.months)/12-(management+distribution+gli+maintenance+seasonalCosts)*(12-s.months)/12-fixed-debt;
  const resale=s.resale>0?s.resale*(1-s.sellingFees/100):null;
  return {s,total,fees,works,reserve,rent,vacancy,nights,potential,lost,collected,management,distribution,gli,maintenance,fixed,seasonalCosts,expenses,net,loan,payment,insurance,debt,equity,cash,firstYear,
    grossYield:total?potential/total*100:0,netYield:total?net/total*100:0,equityYield:equity>0?cash/equity*100:null,
    breakEven:total/(1-s.sellingFees/100),resaleMargin:resale===null?null:resale-total,
    priceFor6:Math.max(0,(potential/.06-(total-s.price-fees))/(1+s.fees/100))};
}
export function matches(p,f,simulation) {
  const query=(f.search||'').toLocaleLowerCase('fr');
  return (!query || `${p.title} ${p.zone} ${p.agency} ${p.area} ${p.ref}`.toLocaleLowerCase('fr').includes(query))
    && (f.status==='all' || (f.status==='archived'?p.archived:!p.archived))
    && (!f.center || p.center) && (!f.floor || p.floor>0)
    && (!f.works || p.condition==='renovate')
    && (!f.budget || calculate(simulation).total<=Number(f.budget))
    && (!f.area || p.area>=Number(f.area));
}
