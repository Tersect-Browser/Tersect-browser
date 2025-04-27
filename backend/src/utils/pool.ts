/* helpers ----------------------------------------------------------- */
import { spawn }   from 'child_process';


export class Pool {
  max = 0;
  active = 0;
  queue = []
  constructor(max) { this.max = max; this.active = 0; this.queue = []; }
  run(fn) {
    return new Promise((resolve, reject) => {
      const exec = () => {
        this.active++;
        fn().then(resolve, reject).finally(() => {
          this.active--;
          if (this.queue.length) this.queue.shift()();
        });
      };
      (this.active < this.max) ? exec() : this.queue.push(exec);
    });
  }
}

export function collectSampleNames(
  data: [string, string][]
): string[] {
  return data.reduce<string[]>((acc, [, names]) => {
    // split on 1 + spaces and push into the accumulator
    names.split(/\s+/).forEach(name => {
      if (name) acc.push(name);   // guard against empty strings
    });
    return acc;
  }, []);
}

export function tersectForKey(key, tsiLocation): Promise<string> {
  return new Promise(res => {
    const p = spawn(
      'tersect', ['samples', tsiLocation, '-c', key],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    p.stdout.on('data', c => {
        // console.log(c, 'from tersect')
        return (out += c)
    });
    p.on('close', () => {
       
      const accessions = out.trim().split('\n').slice(1).join(' ')
      //  console.log(list, first), 'l | f';
      res(accessions || 'NA');
    });
  });
}

