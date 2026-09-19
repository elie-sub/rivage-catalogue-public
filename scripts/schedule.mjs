const dayFormat=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris'});
const hourFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Paris',hour:'2-digit',hourCycle:'h23'});
export const parisDay=date=>dayFormat.format(new Date(date));
export function shouldRunDaily(now,event,lastCompletedDay){
 if(event!=='schedule')return true;
 // GitHub can start a scheduled run hours late. Keep the morning lower bound
 // for the summer/winter schedule pair, but never discard a late daily run.
 return Number(hourFormat.format(now))>=9&&lastCompletedDay!==parisDay(now);
}
