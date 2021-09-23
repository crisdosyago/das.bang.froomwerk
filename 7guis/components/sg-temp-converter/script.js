class Component extends Base {
  constructor() {
    super();
    const state = cloneState('data');
    state.temperatureConverter.k = state.temperatureConverter.initialKelvin;
    setState('data', state);
  }

  SetKelvin(inputEvent) {
    const state = cloneState('data');
    const {temperatureConverter: t} = state;
    const {target: targ} = inputEvent;
    const type = targ.name;
    const value = parseFloat(targ.value);

    switch(type) {
      case "C":
        t.k = this.cToK(value);
        break;
      case "F":
        t.k = this.fToK(value);
        break;
      default: {
        throw new TypeError(`Unknown temperature type: ${type}`);
      }break;
    }

    t.c = parseFloat(this.kToC(t.k).toFixed(2));
    t.f = parseFloat(this.kToF(t.k).toFixed(2));

    setState('data', state);
  }

  kToC(k) {
    return k - 273.15;
  }

  kToF(k) {
    return (k - 273.15) * 9/5 + 32;
  }

  cToK(c) {
    return c + 273.15;
  }

  fToK(f) {
    return (f - 32) * 5/9 + 273.15;
  }
}