/* helpers ----------------------------------------------------------- */
import { spawn }   from 'child_process';
import * as os from 'os'
import * as pLimit from 'p-limit';


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

function getOptimalConcurrency() {
  const cores = os.cpus().length;
  return Math.max(cores - 1, 1); // leave one core free
}

export async function processKeys(keys, tsiPath) {
  const concurrency = getOptimalConcurrency();
  const limit = pLimit(concurrency);

  const total = Array.from(keys).length;
  let completed = 0;

  const results = await Promise.all(
    Array.from(keys).map(key =>
      limit(() => tersectForKey(key, tsiPath).then(val => {
        completed++;
        console.log(`Completed ${completed}/${total}: key=${key}`);
        return [key, val];
      }))
    )
  );

  return results.filter(([_, val]) => val !== 'NA');

}

export function tersectForKey(key, tsiLocation): Promise<string> {
  return new Promise(res => {
    const p = spawn(
      'tersect', ['samples', tsiLocation, '-c', key],
      { stdio: ['ignore', 'pipe', 'pipe'] }
    );
    let out = '';
    p.stdout.on('data', c => {
        return (out += c)
    });
    p.on('close', () => {
       
      const accessions = out.trim().split('\n').slice(1).join(' ')
      res(accessions || 'NA');
    });
  });
}

