// Five INFO reads only. No key scans, cache writes, configuration, or queue work.
import 'dotenv/config';
import Redis from 'ioredis';
import { writeFile } from 'node:fs/promises';
if (!process.env.REDIS_URL) { console.log('Redis diagnostics unavailable: no configured URL'); process.exit(0); }
const redis = new Redis(process.env.REDIS_URL, { lazyConnect: true, enableOfflineQueue: false,
  connectTimeout: 5000, commandTimeout: 5000, maxRetriesPerRequest: 0, retryStrategy: null });
redis.on('error', () => {});
try {
  await redis.connect();
  const parse = text => Object.fromEntries(text.split('\n').filter(row => row.includes(':')).map(row => { const at = row.indexOf(':'); return [row.slice(0, at), row.slice(at + 1).trim()]; }));
  const sections = {};
  for (const section of ['memory', 'stats', 'clients', 'commandstats', 'keyspace']) sections[section] = parse(await redis.info(section));
  const allow = (section, keys) => Object.fromEntries(keys.filter(key => key in sections[section]).map(key => [key, sections[section][key]]));
  const report = { mode: 'Five read-only INFO commands; global server snapshot, not attributed to FlowTask cache',
    memory: allow('memory', ['used_memory', 'used_memory_peak', 'maxmemory', 'maxmemory_policy', 'mem_fragmentation_ratio']),
    stats: allow('stats', ['total_connections_received', 'total_commands_processed', 'instantaneous_ops_per_sec', 'keyspace_hits', 'keyspace_misses', 'evicted_keys', 'expired_keys', 'rejected_connections']),
    clients: allow('clients', ['connected_clients', 'blocked_clients', 'maxclients']),
    commandstats: sections.commandstats, keyspace: sections.keyspace };
  await writeFile(new URL('../../reports/performance-2026-11-06/redis-server.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ memory: report.memory, stats: report.stats, clients: report.clients }));
} catch (error) { console.error('Read-only Redis diagnostics unavailable:', error.code || error.name); process.exitCode = 1; }
finally { redis.disconnect(); }
