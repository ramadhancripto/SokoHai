/* Bounded command history: one snapshot per meaningful action, never per pointer pixel. */
export class CreativeHistory {
  constructor(initial,limit=60){this.limit=limit;this.past=[];this.future=[];this.current=this.copy(initial);}
  copy(v){return JSON.parse(JSON.stringify(v));}
  commit(next){const serialized=JSON.stringify(next);if(serialized===JSON.stringify(this.current))return this.current;this.past.push(this.copy(this.current));if(this.past.length>this.limit)this.past.shift();this.current=this.copy(next);this.future=[];return this.copy(this.current);}
  replace(next){this.current=this.copy(next);return this.copy(this.current);}
  undo(){if(!this.past.length)return this.copy(this.current);this.future.push(this.copy(this.current));this.current=this.past.pop();return this.copy(this.current);}
  redo(){if(!this.future.length)return this.copy(this.current);this.past.push(this.copy(this.current));this.current=this.future.pop();return this.copy(this.current);}
  get canUndo(){return this.past.length>0;} get canRedo(){return this.future.length>0;}
}
