(function () {
  // constants, classes, config and state
    const DEBUG = false;
    const PIPELINE_REQUESTS = true;
    const RANDOM_SLEEP_ON_FIRST_PRINT = true;
    const OPTIMIZE = true;
    const GET_ONLY = true;
    const MOBILE = isMobile();
    const EMPTY = '';
    const {stringify:_STR} = JSON;
    const JS = o => _STR(o, null, EMPTY);
    const LIGHTHOUSE = navigator.userAgent.includes("Chrome-Lighthouse");
    const DOUBLE_BARREL = /^\w+-(?:\w+-?)*$/; // note that this matches triple- and higher barrels, too
    const POS = 'beforeend';
    const LOCAL_PATH = 'this.';
    const PARENT_PATH = 'this.getRootNode().host.';
    const ONE_HIGHER = 'getRootNode().host.';
    const CALL_WITH_EVENT = '(event)';
    const F = _FUNC; 
    const FUNC_CALL = /\);?$/;
    const MirrorNode = Symbol.for('[[MN]]');
    const Template = document.createElement('template');
    const DIV = document.createElement('div');
    const path = location.pathname;
    const CONFIG = {
      htmlFile: 'markup.html',
      scriptFile: 'script.js',
      styleFile: 'style.css',
      bangKey: '_bang_key',
      componentsPath: `${path}${path.endsWith('/') ? EMPTY : '/'}components`,
      allowUnset: false,
      unsetPlaceholder: EMPTY,
      EVENTS: `error load click pointerdown pointerup pointermove mousedown mouseup 
        mousemove touchstart touchend touchmove touchcancel dblclick dragstart dragend 
        dragmove drag mouseover mouseout focus blur focusin focusout scroll
        input change compositionstart compositionend text paste beforepast select cut copy
        contextmenu
      `.split(/\s+/g).filter(s => s.length).map(e => `[on${e}]`).join(','),
      delayFirstPaintUntilLoaded: false,
      capBangRatioAtUnity: false,
      noHandlerPassthrough: false
    };
    const History = [];
    const STATE = new Map();
    const CACHE = new Map();
    const Waiters = new Map();
    const Started = new Set();
    const TRANSFORMING = new WeakSet();
    const Dependents = new Map();
    const MAX_CONCURRENT_REQUESTS = 5;
    const RequestPipeLine = new Map();
    const RequestWaiting = [];
    class Counter {
      started = 0;
      finished = 0;
    };
    const Counts = new Counter;
    const Finished = () => Counts.finished++;
    const SHADOW_OPTS = {mode:'open'};
    const OBSERVE_OPTS = {subtree: true, childList: true, characterData: true};
    const INSERT = 'insert';
    const ALL_DEPS = {allDependents: true};
    let RequestId = 0;
    let hindex = 0;
    let observer; // global mutation observer
    let systemKeys = 1;
    let _c$;

    const BangBase = (name) => class Base extends HTMLElement {
      static #activeAttrs = ['state']; // we listen for changes to these attributes only
      static get observedAttributes() {
        return Array.from(Base.#activeAttrs);
      }
      #name = name;
      #dependents = [];

      constructor({task: task = () => void 0} = {}) {
        super();
        DEBUG && say('log',name, 'constructed');
        this.cookMarkup = async (markup, state) => {
          const cooked = await cook.call(this, markup, state);
          DEBUG && console.log(cooked);
          if ( !this.shadowRoot ) {
            const shadow = this.attachShadow(SHADOW_OPTS);
            //console.log({observer});
            observer.observe(shadow, OBSERVE_OPTS);
            cooked.to(shadow, INSERT);
            const listening = shadow.querySelectorAll(CONFIG.EVENTS);
            listening.forEach(node => this.handleAttrs(node.attributes, {node, originals: true}));
            
            // add dependents
            const deps = await findBangs(transformBang, shadow, ALL_DEPS);
            //console.log(this, {deps});
            this.#dependents = deps.map(node => node.untilLoaded());
          }
        }
        this.markLoaded = async () => {
          if ( ! this.loaded ) {
            this.counts.finished++;
            const loaded = await this.untilLoaded();
            if ( loaded ) {
              this.loaded = loaded;
              //console.log(this, 'loaded');
              this.setVisible();
              if ( ! this.isLazy ) {
                setTimeout(Finished, 0);
              }
            } else {
              // right now this never happens
              //console.log('not loaded', this);
            }
          }
        }
        this.counts = new Counter;
        if ( this.hasAttribute('lazy') ) {
          this.isLazy = true;
          if ( this.hasAttribute('super') ) {
            this.superLazy = true;
            loaded().then(() => sleep(405*Math.random()).then(() => this.print().then(task)));
          } else {
            if ( RANDOM_SLEEP_ON_FIRST_PRINT ) {
              sleep(162*Math.random()).then(() => this.print().then(task));
            } else {
              this.print().then(task);
            }
          }
        } else {
          this.print().then(task);
        }
      }

      get name() {
        return this.#name;
      }

      // BANG! API methods
      async print() {
        if ( !this.alreadyPrinted ) {
          DEBUG && loaded().then(() => globalThis.exposeState = true);
          this.prepareVisibility();
        }
        const state = this.handleAttrs(this.attributes);
        if ( OPTIMIZE && state ) {
          const nextState = JS(state);
          if ( this.alreadyPrinted && this.lastState === nextState ) {
            if ( DEBUG ) {
              if ( globalThis.exposeState ) {
                console.log(JSON.parse(this.lastState), state); 
              }
            }
            DEBUG && console.log(this, 'state no change, returning');
            return;
          }
          this.lastState = nextState;
        }
        return this.printShadow(state)
      }

      update() {
        if ( this.fastUpdate ) {
          return this.fastUpdate();
        } else {
          return this.print();
        }
      }

      prepareVisibility() {
        this.alreadyPrinted = true;
        this.classList.add('bang-el');
        this.counts.started++;
        if ( !this.isLazy ) {
          Counts.started++;
        }
        this.classList.remove('bang-styled');
        // this is like an onerror event for stylesheet's 
          // we do this because we want to display elements if they have no stylesheet defined
          // becuase it's reasonabgle to want to not include a stylesheet with your custom element
        fetchStyle(name).catch(err => {
          say('warn!', err);
        });
      }

      async untilLoaded() {
        // we evaluate the dependents as lazily and as late as possible
        this.#dependents = this.#dependents
        const myDependentsLoaded = (await Promise.all(this.#dependents)).every(loaded => loaded);
        const myContentLoaded = await becomesTrue(() => this.counts.started > 0 && this.counts.finished >= this.counts.started);
        //console.log(this, this.#dependents, myContentLoaded, myDependentsLoaded);
        return myContentLoaded && myDependentsLoaded;
      }

      updateIfChanged(state) {
        const {key, didChange} = stateChanged(state);
        if ( didChange ) {
          DEBUG && console.log(`State changed`, key, state);
          const views = getViews(state);
          DEBUG && console.log(`State views`, views);
          const newKey = updateState(state);
          DEBUG && console.log(`New key`, newKey);
          views.forEach(view => view.setAttribute('state', newKey));
        }
      }

      setVisible() {
        this.classList.add('bang-styled');
      }

      get state() {
        const key = this.getAttribute('state');
        return cloneState(key);
      }

      set state(newValue) {
        const key = this.getAttribute('state');
        if ( key.startsWith('system-key:') ) {
          return this.updateIfChanged(this.state);
        }
        return setState(key, newValue);
      }

      // Web Components methods
      attributeChangedCallback(name, oldValue, value) {
        // setting the state attribute casues the custom element to re-render
        if ( name === 'state' && !isUnset(oldValue) ) {
          this.update();
          /*
            if ( ! Dependents.has(value) ) {
              Dependents.set(value, Dependents.get(oldValue));
            }
            Dependents.delete(oldValue);
            if ( STATE.get(oldValue+'.json.last') !== JS(STATE.get(value)) ) {
              DEBUG && say('log',`Changing state, so calling print.`, oldValue, value, this);
              this.update();
            }
          */
        }
      }

      connectedCallback() {
        say('log',name, 'connected');
        // attributes must be assigned on connection so we can search for
        // references to parents
        this.handleAttrs(this.attributes, {originals: true});
      }


      // private methods
      handleAttrs(attrs, {node, originals} = {}) {
        let state;

        if ( ! node ) node = this;

        // we can optimize this method more, we only get attrs if originals == true
        // otherwise we just get and process the single 'state' attr 
        // this is a lot more performant
        for( let {name,value} of attrs ) {
          if ( isUnset(value) ) continue;
          if ( name === 'state' ) {
            const stateKey = value.trim(); 
            const stateObject = cloneState(stateKey);
            
            if ( isUnset(stateObject) ) {
              console.warn(node);
              self.STATE = STATE;
              console.warn(new ReferenceError(`
                <${node.localName}> constructor passed state key ${stateKey} which is unset. It must be set.
              `));
              break;
            }
            
            state = stateObject;

            if ( originals ) {
              let acquirers = Dependents.get(stateKey);
              if ( ! acquirers ) {
                acquirers = new Set();
                Dependents.set(stateKey, acquirers);
              }
              acquirers.add(node);
              DEBUG && console.log({acquirers, Dependents});
            } else break;
          } else if ( originals ) { // set event handlers to custom element class instance methods
            if ( ! name.startsWith('on') ) continue;
            value = value.trim();
            if ( ! value ) continue;

            // Perf note:
              // Local and Parent are just optimizations to avoid if we can the
              // getAncestor function call, which saves us a couple seconds in large documents
            const Local = node[value] instanceof Function;
            const Parent = node.getRootNode()?.host?.[value] instanceof Function;
            const path = Local ? LOCAL_PATH :
              Parent ? PARENT_PATH : 
              getAncestor(node.getRootNode()?.host?.getRootNode?.()?.host, value)
            ;

            if ( !path || value.startsWith(path) ) continue;

            // Conditional logic explained:
              // don't add a function call bracket if
              // 1. it already has one
              // 2. the reference is not a function
            const ender = value.match(FUNC_CALL) ? EMPTY : CALL_WITH_EVENT;
            node.setAttribute(name, `${path}${value}${ender}`);
          }
        }

        return state;
      }

      printShadow(state) {
        if ( ! state ) return;
        return fetchMarkup(this.#name, this).then(markup => this.cookMarkup(markup, state))
        .catch(err => DEBUG && say('warn!',err))
        .finally(this.markLoaded);
      }
    };

    class StateKey extends String {
      constructor (keyNumber) {
        if ( keyNumber == undefined ) super(`system-key:${systemKeys+=2}`); 
        else super(`client-key:${keyNumber}`);
      }
    }

  install();

  // API
    async function use(name) {
      let component;
      await fetchScript(name)
        .then(script => { // if there's a script that extends base, evaluate it to be component
          const Base = BangBase(name);
          const Compose = `(function () { ${Base.toString()}; return ${script}; }())`;
          try {
            component = eval(Compose);
          } catch(e) {
            say('warn!',e, Compose, component)
          }
        }).catch(err => {  // otherwise if there is no such extension script, just use the Base class
          DEBUG && say('log!', err);
          component = BangBase(name);
        });
      
      self.customElements.define(name, component);
      DEBUG && self.customElements.whenDefined(name).then(obj => say('log',name, 'defined', obj));
    }
    
    // run a map of a list of work with configurable breaks in between
    // to let the main thread breathe at the same time 
    async function schedule(list, func, {
          batchSize: batchSize = 1,
          yieldTime: yieldTime = 0,
          strictSerial: strictSerial = false,
          useFrame: useFrame = true
        } = {}) {
      // note list can be async iterable
      const results = [];
      let i = 0;
      let currentBatch = 0;
      for await ( const item of list ) {
        let result;
        if ( strictSerial ) {
          result = await func(item, i);
        } else {
          result = func(item, i);
        }
        results.push(result);
        i++;
        currentBatch++;
        if ( currentBatch < batchSize ) continue;
        currentBatch = 0;

        if ( useFrame ) {
          await nextFrame();
        } else if ( yieldTime > -1 ) {
          await sleep(yieldTime);
        }
      }
      return results;
    }

    function undoState(key, transform = x => x) {
      while( hindex > 0 ) {
        hindex -= 1;
        if ( History[hindex].name === key ) {
          DEBUG && console.log('Undo state to', History[hindex], hindex, History);
          setState(key, transform(History[hindex].value));
          return true;
        }
      }
      return false;
    }

    function redoState(key, transform = x => x) {
      while( hindex < History.length - 1 ) {
        hindex += 1;
        if ( History[hindex].name === key ) {
          DEBUG && console.log('Redo state to', History[hindex], hindex, History);
          setState(key, transform(History[hindex].value));
          return true;
        }
      }
      return false;
    }

    function bangFig(newConfig = {}) {
      Object.assign(CONFIG, newConfig);
    }

    function runCode(context, str) {
      with(context) {
        return eval(str); 
      }
    }

    function stateChanged(obj) {
      const key = STATE.get(obj);
      const oStateJSON = STATE.get(key+'.json.last');
      const stateJSON = JS(obj);
      return {key, didChange: oStateJSON !== stateJSON, stateJSON, oStateJSON};
    }

    function updateState(state, key) {
      key = key || STATE.get(state);
      if ( ! key ) {
        console.warn('no key for state', state);
        throw new ReferenceError(`Key must exist to update state.`);
      }
      DEBUG && console.log('update state', key, state, STATE);
      const oKey = key;
      const oStateJSON = STATE.get(key+'.json.last');
      DEBUG && console.log('last state', oStateJSON);
      const stateJSON = JS(state);
      STATE.delete(oStateJSON);
      STATE.set(key, state);
      if ( key.startsWith('system-key:') ) {
        STATE.delete(key);
        STATE.delete(key+'.json.last');
        key = new StateKey()+'';
        STATE.set(key, state);
        STATE.set(state, key);
      }
      STATE.set(key+'.json.last', stateJSON);
      STATE.set(stateJSON, key+'.json.last');
      const views = Dependents.get(oKey);
      Dependents.set(key, views);
      return key;
    }

    function getViews(obj) {
      const key = STATE.get(obj);
      const acquirers = Dependents.get(key);
      if ( acquirers ) {
        return Array.from(acquirers);
      } else {
        console.warn('No acquirers for key');
        return [];
      }
    }

    function setState(key, state, {
      rerender: rerender = true, 
      save: save = false
    } = {}) {
      const jss = JS(state);
      let lk = key+'.json.last';
      if ( GET_ONLY ) {
        if ( !STATE.has(key) ) {
          STATE.set(key, state);
          STATE.set(state, key);
          DEBUG && console.log('Setting stringified state', state, key);
          STATE.set(jss,lk);
          STATE.set(lk,jss);
        } else {
          DEBUG && console.log('Updating state', key);
          const oStateJSON = STATE.get(lk);
          /*if ( stateChanged(oState).didChange ) {*/
          if ( oStateJSON !== jss ) {
            DEBUG && console.log('State really changed. Will update', key);
            key = updateState(state, key);
          }
        }
      } else {
        STATE.set(key, state);
        STATE.set(state, key);
        STATE.set(jss,lk);
        STATE.set(lk,jss);
      }

      if ( save ) {
        hindex = Math.min(hindex+1, History.length);
        History.splice(hindex, 0, {name: key, value: clone(state)});
        DEBUG && console.log('set state history add', hindex, History.length-1, History);
      }

      if ( rerender ) { // re-render only those components depending on that key
        const acquirers = Dependents.get(key);
        DEBUG && console.log({acquirers, Dependents});
        if ( acquirers ) acquirers.forEach(host => host.print());
      }
      
      return true;
    }

    function patchState(key, state) {
      return setState(key, state, {rerender: false});
    }

    function cloneState(key, getOnly = GET_ONLY) {
      if ( getOnly ) return STATE.get(key);
      if ( STATE.has(key) ) return clone(STATE.get(key));
      else {
        throw new ReferenceError(`State store does not have the key ${key}`);
      }
    }

    async function loaded() {
      return becomesTrue(loadCheck);
    }

    function loadCheck() {
      const nonZeroCount = Counts.started > 0; 
      const finishedWhatWeStarted = Counts.finished >= Counts.started;
      return nonZeroCount && finishedWhatWeStarted;
    }

    async function bangLoaded() {
      const loadCheck = () => {
        const c_defined = typeof _c$ === "function";
        return c_defined;
      };
      return becomesTrue(loadCheck);
    }

  // network pipelining (for performance)
    async function pipeLinedFetch(...args) {
      if ( !PIPELINE_REQUESTS ) return fetch(...args);
      const key = nextRequestId();
      const result = {args, started: new Date};
      let pr;
      if ( RequestPipeLine.size < MAX_CONCURRENT_REQUESTS ) {
        pr = fetch(...args).catch(err => (say('log', err), err));
        result.pr = pr;
        RequestPipeLine.set(key, result);
        DEBUG && console.log(`${RequestPipeLine.size} concurrent running requests. Request just started and added at ${result.started}`);
        const complete = r => {
          const result = RequestPipeLine.get(key);
          result.finished = new Date;
          result.duration = result.finished - result.started;
          RequestPipeLine.delete(key); 
          DEBUG && console.log(`${RequestPipeLine.size} concurrent running requests. Request just resolved and removed after ${(result.duration/1000).toFixed(1)} seconds.`);
          if ( RequestWaiting.length && RequestPipeLine.size < MAX_CONCURRENT_REQUESTS ) {
            const result = RequestWaiting.shift();
            const req = fetch(...result.args);
            req.then(complete).then(r => (result.resolve(r), r)).catch(e => (result.reject(e), e));
            RequestPipeLine.set(key, result);
            DEBUG && console.log(`${RequestPipeLine.size} concurrent running requests. Request just started and added at ${result.started}`);
          }
          return r;
        };
        pr.then(complete);
      } else {
        let resolve, reject;
        pr = new Promise((res,rej) => (resolve = res, reject = rej));
        result.resolve = resolve;
        result.reject = reject;
        RequestWaiting.push(result);
      }
      return pr;
    }

    function nextRequestId() {
      return `${RequestId++}${Math.random().toString(36)}`;
    }

  // helpers
    async function install() {
      Object.assign(globalThis, {
        use, setState, patchState, cloneState, loaded, 
        sleep, bangFig, bangLoaded, isMobile, trace,
        undoState, redoState, stateChanged, getViews, updateState,
        dateString,
        runCode,
        ...( DEBUG ? { STATE, CACHE, TRANSFORMING, Started, BangBase } : {})
      });

      const module = globalThis.vanillaview || (await import('./vv/vanillaview.js'));
      const {s} = module;
      const That = {STATE,CONFIG,StateKey,JS}; 
      _c$ = s.bind(That);
      That._c$ = _c$;

      if ( CONFIG.delayFirstPaintUntilLoaded ) {
        becomesTrue(() => document.body).then(() => document.body.classList.add('bang-el'));
      }

      observer = new MutationObserver(transformBangs);
      /* we are interested in bang nodes (which start as comments) */
      observer.observe(document, OBSERVE_OPTS);
      await findBangs(transformBang); 
      
      loaded(globalThis.bangRatio).then(() => document.body.classList.add('bang-styled'));
    }

    async function fetchMarkup(name, comp) {
      // cache first
        // we make any subsequent calls for name wait for the first call to complete
        // otherwise we create many in parallel without benefitting from caching

      const key = `markup:${name}`;

      if ( Started.has(key) ) {
        if ( ! CACHE.has(key) ) await cacheHasKey(key);
      } else Started.add(key);

      const styleKey = `style${name}`;
      const baseUrl = `${CONFIG.componentsPath}/${name}`;
      if ( CACHE.has(key) ) {
        const markup = CACHE.get(key);
        if ( CACHE.get(styleKey) instanceof Error ) { 
          /*comp && comp.setVisible(); */
        }
        
        // if there is an error style and we are still includig that link
        // we generate and cache the markup again to omit such a link element
        if ( CACHE.get(styleKey) instanceof Error && markup.includes(`href=${baseUrl}/${CONFIG.styleFile}`) ) {
          // then we need to set the cache for markup again and remove the link to the stylesheet which failed 
        } else {
          /* comp && comp.setVisible(); */
          return markup;
        }
      }
      
      const markupUrl = `${baseUrl}/${CONFIG.htmlFile}`;
      let resp;
      const markupText = await pipeLinedFetch(markupUrl).then(async r => { 
        let text = EMPTY;
        if ( r.ok ) text = await r.text();
        else text = `<slot></slot>`;        // if no markup is given we just insert all content within the custom element
      
        if ( CACHE.get(styleKey) instanceof Error ) { 
          resp = `<style>
            ${await fetchFile(EMPTY, CONFIG.styleFile).catch(err => `/* ${err+EMPTY} */`).then(e => {
              if ( e instanceof Error ) return `/* no ${name}/${CONFIG.styleFile} defined */`;
              return e;
            })}
          </style>${text}` 
        } else {
          // inlining styles for increase speed */
          resp = `<style>
            ${await fetchFile(EMPTY, CONFIG.styleFile).catch(err => `/* ${err+EMPTY} */`).then(e => {
              if ( e instanceof Error ) return `/* no ${name}/${CONFIG.styleFile} defined */`;
              return e;
            })}
            ${await fetchStyle(name).then(e => {
              if ( e instanceof Error ) return `/* no ${name}/${CONFIG.styleFile} defined */`;
              return e;
            })}
          </style>${text}`;
        }
        
        return resp;
      }).finally(async () => CACHE.set(key, await resp));
      return markupText;
    }

    async function fetchFile(name, file) {
      const key = `${file}:${name}`;

      if ( Started.has(key) ) {
        if ( ! CACHE.has(key) ) await cacheHasKey(key);
      } else Started.add(key);

      if ( CACHE.has(key) ) return CACHE.get(key);

      const url = `${CONFIG.componentsPath}/${name ? name + '/' : EMPTY}${file}`;
      let resp;
      const fileText = await pipeLinedFetch(url).then(r => { 
        if ( r.ok ) {
          resp = r.text();
          return resp;
        } 
        resp = new ReferenceError(`Fetch error: ${url}, ${r.statusText}`);
        throw resp;
      })
      .finally(async () => CACHE.set(key, await resp));
      
      return fileText;
    }

    async function fetchStyle(name) {
      return fetchFile(name, CONFIG.styleFile);
    }

    async function fetchScript(name) {
      return fetchFile(name, CONFIG.scriptFile);
    }

    // search and transform each added subtree
    async function transformBangs(records) {
      //console.log('records', records);
      for( const record of records ) {
        DEBUG && say('log',record);
        const {addedNodes} = record;
        if ( !addedNodes ) return;
        for( const node of addedNodes ) {
          await findBangs(transformBang, node);
        }
      }
    }

    function transformBang(current) {
      DEBUG && say('log',{transformBang},{current});
      const [name, data] = getBangDetails(current);
      //console.log(name, current);
      DEBUG && say('log',{name, data});

      // replace the bang node (comment) with its actual custom element node
      const actualElement = createElement(name, data);
      say('log',{current,actualElement});
      current.linkedCustomElement = actualElement;
      actualElement[MirrorNode] = current;
      current.parentNode.replaceChild(actualElement, current);
    }

    async function findBangs(callback, root = document.documentElement, {
          allDependents: allDependents = false,
          batchSize: batchSize = 10,
          yieldTime: yieldTime = 0,
          useFrame: useFrame = true
        } = {}) {
      if ( root.noFindBang ) return allDependents ? [] : void 0;
      const found = allDependents ? 
        node => node.nodeType === Node.COMMENT_NODE || 
          node.nodeType === Node.ELEMENT_NODE 
        :
        node => node.nodeType === Node.COMMENT_NODE
      ;
      const Filter = allDependents ? 
        NodeFilter.SHOW_COMMENT | NodeFilter.SHOW_ELEMENT
        :
        NodeFilter.SHOW_COMMENT
      ;
      const Details = allDependents ? 
        getNodeDetails  
        :
        getBangDetails
      ;
      const Return = allDependents ? NodeFilter.FILTER_SKIP : NodeFilter.FILTER_REJECT;
      const Acceptor = {
        acceptNode(node) {
          if ( found(node) ) {
            const [name] = Details(node); 
            if ( name.match(DOUBLE_BARREL) ) return NodeFilter.FILTER_ACCEPT;
            else return Return; 
          } else if ( isDocument(node) ) {
            return NodeFilter.FILTER_ACCEPT;
          } else return NodeFilter.FILTER_SKIP;
        }
      };
      const iterator = document.createTreeWalker(root, Filter, Acceptor);
      const replacements = [];
      const dependents = [];

      DEBUG && console.log('root', root, {allDependents});

      // handle root node
        // Note:
          // it's a special case because it will be present in the iteration even if
          // the NodeFilter would filter it out if it were not the root
        let current = iterator.currentNode;

        // Note:
          // we need isBangTag here because a node that doesn't pass 
          // Acceptor.accept will stop show up as the first currentNode
          // in a tree iterator
        if ( isBangTag(current) ) {
          if ( !TRANSFORMING.has(current) ) {
            TRANSFORMING.add(current);
            const target = current;
            replacements.push(() => transformBang(target));
          }
        }

      // handle any descendents
        while (true) {
          current = iterator.nextNode();
          if ( ! current ) break;

          // Note:
            // a small optimization is replace isBangTag by the following check
            // we don't need isBangTag here because it's already passed the 
            // equivalent check in Acceptor.acceptNode
          if ( current.nodeType === Node.COMMENT_NODE ) {
            if ( !TRANSFORMING.has(current) ) {
              TRANSFORMING.add(current);
              const target = current;
              replacements.push(() => transformBang(target));
            }
          }
          dependents.push(current);
        }

      let i = 0;
      while(replacements.length) {
        replacements.pop()();
        i++;
        if ( i < batchSize ) continue;
        i = 0;
        if ( useFrame ) {
          await nextFrame();
        } else {
          await sleep(yieldTime);
        }
      }

      if ( allDependents ) {
        return dependents
          .map(actualElement)
          .filter(el => el && !el.hasAttribute('lazy'));
      } else return;
    }

    function actualElement(node) {
      const el = node.nodeType === Node.COMMENT_NODE ? 
        node.linkedCustomElement 
        : 
        node 
      ;
      //console.log(node, el);
      return el;
    }

    function getAncestor(node, value) {
      if ( node ) {
        const currentPath = [PARENT_PATH + ONE_HIGHER];
        while( node ) {
          if ( node[value] instanceof Function ) return currentPath.join(EMPTY);
          node = node.getRootNode().host;
          currentPath.push( 'getRootNode().host.' );
        }
      }
      return null;
    }

    function isBangTag(node) {
      return node.nodeType === Node.COMMENT_NODE && getBangDetails(node)[0].match(DOUBLE_BARREL);
    }

    function isDocument(node) {
      return node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ||
        node.nodeType === Node.DOCUMENT_NODE
      ;
    }

    function getBangDetails(node) {
      const text = node.textContent.trim();
      const [name, ...data] = text.split(/[\s\t]/g);
      return [name.trim(), data.join(' ')];
    }

    function getNodeDetails(node) {
      switch(node.nodeType) {
        case Node.COMMENT_NODE:
          return getBangDetails(node);
        case Node.ELEMENT_NODE:
          return [node.localName];
      }
    }

    async function process(x, state) {
      const tox = typeof x;
      if ( tox === 'string' ) return x;
      else 

      if ( tox === 'number' ) return x+EMPTY;
      else

      if ( tox === 'boolean' ) return x+EMPTY;
      else

      if ( x instanceof Date ) return x+EMPTY;
      else

      if ( isUnset(x) ) {
        if ( CONFIG.allowUnset ) return CONFIG.unsetPlaceholder || EMPTY;
        else {
          throw new ReferenceError(`Value cannot be unset, was: ${x}`);
        }
      }
      else

      if ( x instanceof Promise ) return await x.catch(err => (say('warn!', err), err+EMPTY));
      else

      if ( x instanceof Element ) return x.outerHTML;
      else

      if ( x instanceof Node ) return x.textContent;
      else

      if ( isIterable(x) ) {
        // if an Array or iterable is given then
        // its values are recursively processed via this same function
        return (await Promise.all(
          (
            await Promise.all(Array.from(x)).catch(e => (say('warn!', err), err+EMPTY))
          ).map(v => process(v, state))
        )).join(' ');
      }
      else

      if ( Object.getPrototypeOf(x).constructor.name === 'AsyncFunction' ) return await x(state);
      else

      if ( x instanceof Function ) return x(state);
      else // it's an object, of some type 

      {
        // State store     
          /* so we assume an object is state and save it */
          /* to the global state store */
          /* which is two-sides so we can find a key */
          /* given an object. This avoid duplicates */
        const jx = JS(x);
        let stateKey;

        // own keys
          // an object can specify it's own state key
          // to provide a single logical identity for a piece of state that may
          // be represented by many objects

        if ( !isUnset(x[CONFIG.bangKey]) ) {
          stateKey = new StateKey(x[CONFIG.bangKey])+EMPTY;
          const jk = stateKey+'.json.last';
          // in that case, replace the previously saved object with the same logical identity
          const oldX = STATE.get(jk);
          if ( oldX !== jx ) {
            STATE.delete(oldX);
            STATE.delete(STATE.get(stateKey));

            STATE.set(stateKey, x);
            STATE.set(x, stateKey);
            STATE.set(jx, jk);
            STATE.set(jk,jx);
          }
        } 

        else  /* or the system can come up with a state key */

        {
          if ( STATE.has(jx) ) stateKey = STATE.get(jx);
          else {
            stateKey = new StateKey()+EMPTY;
            const jk = stateKey+'.json.last';
            STATE.set(stateKey, x);
            STATE.set(x, stateKey);
            STATE.set(js, jk);
            STATE.set(jk,jx);
          }
        }

        stateKey += EMPTY;
        DEBUG && say('log',{stateKey});
        return stateKey;
      }
    }

    async function cook(markup, state) {
      const that = this;
      let cooked = EMPTY;
      try {
        if ( !state._self ) {
          Object.defineProperty(state, '_self', {value: state});
        }
        DEBUG && say('log','_self', state._self);
      } catch(e) {
        say('warn!',
          `Cannot add '_self' self-reference property to state. 
            This enables a component to inspect the top-level state object it is passed.`
        );
      }
      try {
        with(state) {
          cooked = await eval("(async function () { return await _FUNC`${{state}}"+markup+"`; }())");  
        }
        DEBUG && console.log({cooked});
        return cooked;
      } catch(error) {
        say('error!', 'Template error', {markup, state, error});
        throw error;
      }
    }

    async function _FUNC(strings, ...vals) {
      const s = Array.from(strings);
      const ret =  await _c$(s, ...vals);
      return ret;
    }

    function createElement(name, data) {
      return toDOM(`<${name} ${data}></${name}>`).firstElementChild;
    }

    function toDOM(str) {
      DIV.replaceChildren();
      DIV.insertAdjacentHTML(POS, `<template>${str}</template>`);
      return DIV.firstElementChild.content;
    }

    function toDOM_(str) {
      Template.innerHTML = str;
      return Template.content;
    }

    async function becomesTrue(check = () => true) {
      return new Promise(async res => {
        while(true) {
          await nextFrame();
          if ( check() ) break;
        }
        res(true);
      });
    }

    // this is to optimize using becomesTrue so we don't start a new timer
    // for every becomesTrue function call (in the case of the cache check, anyway)
    // we can use this pattern to apply to other becomesTrue calls like loaded
    async function cacheHasKey(key) {
      try {
        const WaitKey = `cache:${key}`;
        let waiters = Waiters.get(WaitKey);
        if ( ! waiters ) {
          const list = [];
          waiters = {
            WaitKey,
            list,
            event: becomesTrue(() => CACHE.has(key)).then(() => list.reverse().forEach(res => res()))
          };
          Waiters.set(WaitKey, waiters);
          DEBUG && console.log('Setup waiter list', waiters);
        }
        let res;
        const pr = new Promise(resolve => res = resolve);
        waiters.list.push(res);
        return pr;
      } catch(e) {
        //say('warn!', e);
      }
    }

    async function sleep(ms) {
      return new Promise(res => setTimeout(res, ms));
    }
    
    async function nextFrame() {
      return new Promise(res => requestAnimationFrame(res));
    }

    function isIterable(y) {
      if ( y === null ) return false;
      return y[Symbol.iterator] instanceof Function;
    }

    function isUnset(x) {
      return x === undefined || x === null;
    }

    function say(mode, ...stuff) {
      (DEBUG || mode === 'error' || mode.endsWith('!')) && MOBILE && !LIGHTHOUSE && alert(`${mode}: ${stuff.join('\n')}`);
      (DEBUG || mode === 'error' || mode.endsWith('!')) && console[mode.replace('!',EMPTY)](...stuff);
    }

    function isMobile() {
      const toMatch = [
        /Android/i,
        /webOS/i,
        /iPhone/i,
        /iPad/i,
        /iPod/i,
        /BlackBerry/i,
        /Windows Phone/i
      ];

      return toMatch.some((toMatchItem) => {
        return navigator.userAgent.match(toMatchItem);
      });
    }
  
    function trace(msg = EMPTY) {
      const tracer = new Error('Trace');
      console.log(msg, 'Call stack', tracer.stack);
    }

    function dateString(date) {
      const offset = date.getTimezoneOffset()
      date = new Date(date.getTime() - (offset*60*1000))
      return date.toISOString().split('T')[0];
    }

    function clone(o) {
      return JSON.parse(JS(o));
    }
}());


