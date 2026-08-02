import type { Topic } from "./types";

// System Design topics.
//
// Honesty note, because it shapes every `axonflux` field below: AxonFlux is a
// single-node, single-store, single-developer system. Most of what follows is
// deliberately NOT built here. The Academy's job is to record *why* — the scale
// that would flip each decision — not to pretend a supermarket dashboard runs a
// service mesh. "I did not build X, here is the trigger at which I would, and
// here is the cheaper thing I built instead" is the strongest form of these
// answers, and it is the only form that survives a follow-up question.

export const SYSTEMS_TOPICS: Topic[] = [
  // ── SCALING THE DATA TIER ───────────────────────────────────────────
  {
    id: "db-scaling",
    title: "Database Scaling: Replicas, Sharding, Partitioning",
    domain: "systems",
    difficulty: "intermediate",
    status: "ready",
    tagline: "one machine, until arithmetic says otherwise",
    analogy:
      "A single-counter shop. First you hire more people to *read* the price list aloud — copies of the same list, everyone sees the same prices (replicas). Then the shop gets so big that one price list won't physically fit on the counter, so you split it: A–M on this counter, N–Z on that one (sharding). Splitting is the painful step, because now a customer asking about both halves needs two queues.",
    problem:
      "One database server has a hard ceiling: finite CPU, finite RAM, finite disk IOPS, and one write log. Traffic grows past it in three different ways — too many concurrent readers, too much data to fit or index efficiently, too many writes for one log — and each of those three has a *different* fix. Choosing the wrong fix costs you a rewrite.",
    withoutIt:
      "You hit the ceiling with no vocabulary for what is actually saturated, so you 'scale up' by renting a bigger box until there is no bigger box, then discover that the thing you actually needed — partitioning by date, or moving reporting to a replica — was a one-day change you could have made two years earlier.",
    prereqs: ["postgres-optimization"],
    unlocks: ["consistency-models", "load-balancing"],
    level1: [
      "There are only four moves, and they are not interchangeable. Vertical scaling: a bigger machine. Read replicas: streaming copies of the primary that serve SELECTs while all writes still go to one place. Partitioning: one logical table physically split into chunks (usually by date) inside one database. Sharding: the data split across separate databases that do not know about each other.",
      "The order matters because the cost curve is exponential. Vertical is free engineering-wise and you should exhaust it first. Replicas cost you replication lag and a routing decision. Partitioning costs you a schema migration and some query-planner literacy. Sharding costs you cross-shard joins, distributed transactions, and rebalancing — it is the point where your database stops behaving like a database.",
      "AxonFlux is at step zero on purpose: one Postgres instance, one store, largest derived table ~2.3M rows. A full pipeline rebuild takes minutes and the dashboard's heaviest query is tens of milliseconds. Nothing here is saturated, so nothing here is split. What the project *does* have is the vocabulary to say which move comes first when it is.",
    ],
    level2: [
      {
        heading: "Read replicas and the lag you inherit",
        body: "A replica replays the primary's write-ahead log. That replay is asynchronous by default, so a replica is always some milliseconds-to-seconds behind. The moment you route reads there, you inherit read-your-own-writes bugs: a user submits a cash closure, the UI refetches, the replica hasn't caught up, and the record 'vanishes'. The standard fixes are all about routing, not replication — send a user's reads to the primary for N seconds after their write (sticky sessions), or route by query class: writes and post-write reads to the primary, analytics and reporting to replicas. AxonFlux's read/write split is unusually clean if it ever needs one, because `derived.*` is read-only between pipeline runs and `app.*` holds every write.",
      },
      {
        heading: "Partitioning: the move most people skip and shouldn't",
        body: "Postgres declarative partitioning splits one table into child tables by a key — for time-series data, almost always the date. Two things get dramatically better: the planner prunes irrelevant partitions (a query for last week never touches 2024's rows), and dropping old data becomes DROP TABLE instead of a DELETE that bloats the heap and triggers a vacuum storm. For AxonFlux, `derived.product_daily_metrics` is a textbook candidate — dense (date × product), append-shaped, always queried by date range. It is not partitioned today because 2.3M rows fit comfortably in memory and the honest reason to partition is *maintenance*, not speed, and there is no maintenance pain yet.",
      },
      {
        heading: "Sharding, and the key that decides everything",
        body: "Sharding splits rows across independent databases by a shard key. Everything downstream is determined by that key. Shard by customer? Per-customer queries are one hop; cross-customer analytics fan out to every shard. Shard by date? Recent data all lands on one shard and that shard melts (hotspotting). A genuinely multi-store AxonFlux would shard by store_id, because every query already filters by store and stores never join to each other — that is the tell for a good shard key: the natural query boundary and the data boundary are the same line. When they are not the same line, sharding hurts constantly, and hash-based sharding with a routing layer (Vitess, Citus) becomes the only sane path.",
      },
    ],
    level3: [
      {
        heading: "Where the real ceiling actually is",
        body: "Engineers routinely shard at 100× too early. A single modern Postgres box handles low-terabyte datasets and tens of thousands of reads/sec with good indexes. The signals that genuinely justify splitting: working set no longer fits in RAM (buffer cache hit ratio falling below ~99%), the write log itself saturated, vacuum unable to keep up with the churn, or a maintenance window (index rebuild, migration) that no longer fits in a night. Note that three of those four are maintenance problems, not query-speed problems. AxonFlux's connection pool is SQLAlchemy's default — 5 persistent connections plus 10 overflow, `pool_pre_ping=True` — and even that has never been the bottleneck; the bottleneck when one appeared was a heavy-CTE object defined as a VIEW instead of a TABLE, which was a 12× win for zero infrastructure.",
      },
      {
        heading: "The failure mode of each move",
        body: "Vertical: no failure mode except a bill and a hard ceiling. Replicas: stale reads, plus a failover story you now must own — promoting a replica loses whatever the lag hadn't shipped. Partitioning: a query that doesn't filter on the partition key scans every partition, which is worse than not partitioning; and the planner only prunes if the key appears as a literal-comparable predicate. Sharding: cross-shard joins move into your application code, transactions across shards need two-phase commit or a saga, and rebalancing a hot shard is a data migration under load. Each move buys throughput by spending a guarantee you previously got for free.",
      },
      {
        heading: "Interview framing",
        body: "Do not reach for sharding. Say: 'One Postgres instance, 2.3M rows in the largest table — deliberately unsharded and unpartitioned. I know the order of moves and I can name my trigger for each: replicas when dashboard reads contend with pipeline writes, date partitioning on product_daily_metrics when maintenance windows stop fitting, sharding by store_id only if this becomes multi-tenant — because store_id is already the natural query boundary, which is what makes it a safe shard key.' That answer demonstrates you know the ladder AND that you can resist climbing it, which is the rarer signal.",
      },
    ],
    axonflux:
      "Deliberately not used. One Postgres instance, no replicas, no shards, no partitions — one store, one machine, ~2.3M rows in the largest derived table, and a rebuild measured in minutes. The scaling work that DID happen was cheaper and further down the stack: converting heavy-CTE derived objects from VIEW to TABLE (the pipeline rebuild makes materialization free — a 12× win on product_dimension) and indexing. The named triggers for each real move: replicas when dashboard reads start contending with the pipeline's writes; date partitioning on derived.product_daily_metrics when maintenance stops fitting a night; sharding by store_id only in a multi-store future.",
    companies:
      "Instagram famously ran on a small number of sharded Postgres instances for years. Notion's 2021 shard migration is the best public write-up of doing it late and deliberately. Figma partitioned and then vertically sharded Postgres rather than moving to a distributed database. Citus and Vitess exist because sharding-by-hand is where teams lose quarters.",
    whenNot:
      "Do not shard for a dataset that fits on one machine, and do not add a replica to 'be safe' — you have added a lag bug and a failover procedure in exchange for headroom you weren't using. Do not partition a table you never query by range. If your slow query is slow because of a missing index, no amount of horizontal scale fixes it; it just makes the same bad plan run in more places.",
    files: [
      { path: "config/db.py", note: "the single engine + connection pool the whole app shares" },
      { path: "sql/rebuild_derived/01_product_daily_metrics.sql", note: "~2.3M-row date × product table — the partitioning candidate" },
      { path: "sql/rebuild_derived/05_necessary_views.sql", note: "where the VIEW→TABLE materialization lesson landed" },
    ],
    interview: [
      {
        q: "Your largest table is 2.3M rows. When would you shard it?",
        a: "Not at 2.3M, and probably not at 100M. Sharding buys write throughput and dataset size at the cost of cross-shard joins and distributed transactions — I'd exhaust vertical scale, then read replicas for the reporting workload, then date partitioning for maintenance, before splitting across databases. The concrete trigger for me would be multi-tenancy: many stores, where store_id is already the boundary every query filters on. Same-line data boundary and query boundary is what makes a shard key safe; without that, sharding costs you on every request.",
      },
      {
        q: "You add a read replica and users start reporting that saved records disappear. What happened and how do you fix it?",
        a: "Read-your-own-writes violation. The write went to the primary, the immediate refetch hit a replica that hadn't replayed the WAL yet. Fixes in order of cost: route reads to the primary for a short window after a user's write, or return the written entity in the write response so the UI doesn't refetch at all, or use synchronous replication for that path and pay the latency. The general lesson is that adding a replica converts a storage problem into a routing problem — the consistency model changed and the application has to know it.",
      },
      {
        q: "How would you decide between partitioning and sharding for a time-series table?",
        a: "Partitioning if the pain is maintenance or planner work inside one machine — dropping old data, vacuum pressure, index rebuild time — because it keeps one database and one transaction domain. Sharding only if one machine can no longer hold or write the data at all. Partitioning by date also has a specific trap: it only helps if queries carry the date predicate, and it creates a hot partition for 'today' writes, which is exactly why date is a good *partition* key and a bad *shard* key.",
      },
    ],
    mentor: {
      deep: [
        "The four moves and their strict cost ordering — vertical, replica, partition, shard",
        "Why the shard key determines every future query, and what makes one safe",
        "That replicas change your consistency model, not just your capacity",
      ],
      abstract: [
        "WAL streaming internals and replication protocol details",
        "Citus/Vitess implementation specifics until you actually need a routing layer",
      ],
      mistakes: [
        "Sharding before profiling — the ceiling is far higher than intuition says",
        "Choosing a shard key from data shape instead of query shape",
        "Adding a replica and routing all reads to it without thinking about read-your-own-writes",
        "Partitioning a table whose queries don't filter on the partition key",
      ],
    },
    exercises: [
      "Run EXPLAIN (ANALYZE, BUFFERS) on the heaviest analytics endpoint's query and write down which resource is actually saturated — if any.",
      "Write the DDL to convert derived.product_daily_metrics to a monthly range-partitioned table, then list every query in api/routers/analytics.py that would lose partition pruning.",
      "Assume a 50-store future. Write out three candidate shard keys and, for each, one query that becomes a fan-out.",
      "Measure the current pool: how many concurrent requests does it take to exhaust 5+10 connections, and what does the client see when it happens?",
    ],
    pos: { x: 53, y: 10 },
  },

  // ── SCALING THE COMPUTE TIER ────────────────────────────────────────
  {
    id: "load-balancing",
    title: "Load Balancing & Horizontal Scale",
    domain: "systems",
    difficulty: "intermediate",
    status: "ready",
    tagline: "many identical servers, one honest front door",
    analogy:
      "Supermarket checkout counters. One counter serves everyone until the queue reaches the back wall. Open five identical counters and someone at the front has to direct customers — that director is the load balancer. It only works because the counters are interchangeable: if counter 3 kept your half-scanned basket under the desk, you could never be sent to counter 4. That 'nothing kept under the desk' rule is statelessness, and it is the entire prerequisite for horizontal scale.",
    problem:
      "One application process has a request ceiling and, worse, is a single point of failure — it restarts and the site is down. You want N processes behind one address so capacity adds linearly and one death is invisible. But the moment there are N, every piece of local state inside a process becomes a lie.",
    withoutIt:
      "Capacity is capped by one box's cores, every deploy is downtime, and any crash is an outage. Then when you finally add a second instance, in-memory sessions, local file uploads, and in-process schedulers all break at once — because none of them were ever designed to be duplicated.",
    prereqs: ["db-scaling"],
    unlocks: ["microservices-tradeoff"],
    level1: [
      "A load balancer is a reverse proxy that accepts every request and forwards it to one of N identical backends. Layer 4 balancers route by IP/port and are dumb and fast; Layer 7 balancers read the HTTP request and can route by path, header, or cookie. Algorithms are mostly boring — round robin, least-connections (better under uneven request costs), consistent hashing (when you want the same key to land on the same node, e.g. for a local cache).",
      "The load balancer's second job matters more than its first: health checks. It polls each backend and removes unhealthy ones from rotation. That is what converts N servers from 'more capacity' into 'fault tolerance', and it's why the health endpoint is a real piece of engineering rather than a `return {ok: true}` — a check that doesn't test the database will happily keep routing traffic to an instance that can't serve any of it.",
      "The precondition is statelessness. Any state a request needs must live somewhere shared — the database, Redis, object storage — never in the process. AxonFlux is accidentally well-positioned here: JWT auth means no server-side session store, and the C2 storage abstraction means uploads go to a StorageClient rather than a local disk path. The one thing that is not stateless is the pipeline subprocess, and that is exactly where the known race lives.",
    ],
    level2: [
      {
        heading: "What stops being true when you go from 1 to N",
        body: "In-memory anything: caches diverge per instance, an in-process rate limiter allows N× your intended limit, and a module-level dict is now N dicts. Local disk: an upload written to instance 2's filesystem 404s when the next request lands on instance 1 — this is precisely why AxonFlux's `api/storage/client.py` abstracts Local vs R2 behind one interface, and why R2 is the honest answer for any multi-instance deployment. Background schedulers: an in-process cron fires N times. Long-running work: a subprocess spawned by instance 1 is invisible to instance 3, so the status endpoint answers 'no run in progress' half the time. Every one of these is the same bug — process-local state in a world with N processes.",
      },
      {
        heading: "Sticky sessions and why they're a trap",
        body: "The tempting shortcut when statelessness breaks is session affinity: hash the client to a fixed backend. It works, and it quietly re-couples you to a machine — that backend's death now loses those users' state, autoscaling can't rebalance existing connections, and a deploy is disruptive rather than invisible. Affinity is legitimate for connection-oriented protocols (WebSockets, SSE streams) where the connection itself is the state. It is not a fix for storing sessions in memory; that's a database or Redis job. AxonFlux uses JWTs precisely so there is no session to be sticky about.",
      },
      {
        heading: "The single-flight problem, which AxonFlux actually has",
        body: "`POST /api/pipeline/trigger` launches `pipelines/weekly_pipeline.py` as a subprocess. With one API process, two simultaneous clicks already race: both subprocesses TRUNCATE `derived.*` while the other is filling it. Behind a load balancer with N instances, the race widens from 'two clicks' to 'two anythings', and no in-process lock can help, because the instances share nothing but the database. The documented fix is single-flight locking — and the correct primitive is one the *shared* tier owns: a Postgres advisory lock or a unique constraint on an 'active run' row, not a Python mutex. That is the general rule: once you're horizontal, every mutual-exclusion problem must move to shared storage.",
      },
    ],
    level3: [
      {
        heading: "Health checks, draining, and the deploy you don't notice",
        body: "Three distinct probes, and conflating them causes outages. Liveness: is the process alive? Failing it restarts the container. Readiness: can it serve traffic *right now*? Failing it removes the instance from rotation without killing it. Startup: has slow init finished? A common production incident is making readiness depend on the database, so a brief DB blip fails readiness on every instance simultaneously and the load balancer removes the entire fleet — a self-inflicted total outage. The complementary piece is connection draining: on shutdown, fail readiness first, let in-flight requests finish, then exit. Readiness-then-drain is what makes rolling deploys invisible to users.",
      },
      {
        heading: "Load balancing is not the only bottleneck-mover",
        body: "Adding instances multiplies pressure on everything shared. Ten API instances × 15 connections each is 150 Postgres connections, and Postgres's per-connection memory model makes that expensive — this is where PgBouncer stops being optional. The database, not the app tier, is usually what actually limits horizontal scale, which is why db-scaling is the prerequisite topic rather than the sequel. There's also a special case worth naming from this repo: `web/app/api/chat-proxy/route.ts` exists purely to dodge a 30-second platform timeout on long AI requests. That's a reminder that intermediaries — load balancers, CDNs, serverless platforms — impose their own limits (timeouts, body sizes, header caps) that your application never had, and a chunk of production debugging is discovering which box in the path enforced the rule.",
      },
      {
        heading: "Interview framing",
        body: "The honest, strong version: 'No load balancer — this runs as one uvicorn process, locally, accessed over Tailscale, for a single store. But the design is deliberately horizontal-ready: stateless JWT auth, storage behind a StorageClient interface so uploads never touch local disk, and analytics reads that hold no session. I can also name the exact thing that would break first: the pipeline trigger spawns a subprocess and has no cross-instance lock, so single-flight would have to move to a Postgres advisory lock before a second instance existed.' Naming what breaks first is worth more than claiming you'd 'just add nginx'.",
      },
    ],
    axonflux:
      "Deliberately not used. There is no load balancer and no second instance — AxonFlux runs as a single uvicorn process on one machine, reached over Tailscale, serving one store's staff. What exists instead is horizontal-readiness by accident of good choices: JWT auth means no server-side sessions, and `api/storage/client.py` keeps uploads off local disk. The one genuine blocker is documented and unbuilt: the pipeline runs as a subprocess with no single-flight lock, so two triggers race on TRUNCATE today and would race harder across instances. The trigger to actually add a balancer would be a public workload — the planned Vercel storefront — not internal staff traffic, which will never need more than one process.",
    companies:
      "Every public web system has one: AWS ALB/NLB, GCP Cloud Load Balancing, nginx and HAProxy on-prem, Envoy inside service meshes. Kubernetes bakes the pattern in — a Service is a load balancer, and readiness probes are the health-check contract. Vercel and similar platforms hide the balancer entirely, which is why their timeout and payload limits surprise people.",
    whenNot:
      "One process serving a handful of internal users does not need a balancer; you'd add an operational component, a health-check contract, and a class of routing bugs for zero throughput gain. Also skip it when your bottleneck is the database — N app instances hammering one saturated Postgres just moves the queue. And never add horizontal scale before removing process-local state; the balancer will expose every piece of it at once, in production.",
    files: [
      { path: "api/main.py", note: "single FastAPI app — the process that would be replicated" },
      { path: "api/routers/pipeline.py", note: "subprocess trigger with no cross-instance lock — the first thing that breaks at N>1" },
      { path: "api/storage/client.py", note: "StorageClient abstraction — why uploads are not stuck on one box's disk" },
      { path: "web/app/api/chat-proxy/route.ts", note: "exists solely to work around a 30s platform timeout — intermediaries impose their own limits" },
    ],
    interview: [
      {
        q: "You're asked to run two instances of this API tomorrow. What breaks?",
        a: "The pipeline trigger, first and worst. It spawns a subprocess and neither instance can see the other's run, so the existing TRUNCATE race gets wider and the run-status endpoint becomes unreliable. The fix isn't a Python lock — mutual exclusion has to move to shared state, so a Postgres advisory lock or a unique constraint on an active-run row. Second, local storage: if STORAGE is configured to Local rather than R2, uploads land on one box's disk and 404 from the other. Auth is fine because JWTs are stateless, and analytics reads are fine because they're pure database reads.",
      },
      {
        q: "Why is a health check that pings the database sometimes dangerous?",
        a: "Because if it's wired to readiness across the whole fleet, a two-second database blip fails readiness on every instance at once and the load balancer pulls all of them — turning a transient dependency issue into a total outage. The safer split is liveness that only proves the process is alive, readiness that reflects whether this instance can serve, and dependency health surfaced as a metric rather than as a rotation decision. If the database is truly down, removing servers doesn't help anyway; requests should fail fast with a clear error.",
      },
    ],
    mentor: {
      deep: [
        "Statelessness as the precondition — and the full inventory of process-local state that violates it",
        "Liveness vs readiness vs startup, and why conflating them causes fleet-wide outages",
        "Why mutual exclusion must move to shared storage once N>1",
      ],
      abstract: [
        "L4 vs L7 balancer internals and connection-handling details",
        "Specific balancer configuration syntax until you operate one",
      ],
      mistakes: [
        "Reaching for sticky sessions instead of removing the in-memory session",
        "Adding app instances while the database is the actual bottleneck",
        "Forgetting that in-process rate limits and caches multiply by N",
        "Health endpoints that return 200 unconditionally — the balancer then routes to broken instances forever",
      ],
    },
    exercises: [
      "Grep the API for module-level mutable state and in-process background work; write the list of everything that breaks at N=2.",
      "Replace the pipeline's implicit no-lock with a Postgres advisory lock; prove it by triggering from two terminals simultaneously.",
      "Write a real readiness endpoint for this API and argue, in two sentences, whether it should check Postgres.",
      "Run two uvicorn processes on different ports behind a trivial nginx round-robin config and find the first thing that misbehaves.",
    ],
    pos: { x: 62, y: 22 },
  },

  // ── CONSISTENCY ─────────────────────────────────────────────────────
  {
    id: "consistency-models",
    title: "Consistency Models",
    domain: "systems",
    difficulty: "advanced",
    status: "ready",
    tagline: "what 'the data is correct' actually promises",
    analogy:
      "A shop with a whiteboard price list and photocopies pinned at every aisle. Change the whiteboard and, for a few minutes, different aisles quote different prices. Nobody is lying — every copy was true at some point. A consistency model is the written promise about *how wrong* a copy is allowed to be, and for how long. Strong consistency means every aisle is repainted before the change is acknowledged; eventual consistency means the copies converge and you shrug about the gap.",
    problem:
      "The instant there is more than one copy of data — a replica, a cache, a materialized table, a browser holding fetched JSON — 'what is the current value?' stops having one answer. Systems then either pay coordination cost to keep one answer, or expose the disagreement to the application. Pretending the question is simple is how data bugs become unreproducible.",
    withoutIt:
      "You debug ghosts. A record that saved but doesn't appear, a total that's right on one screen and wrong on another, a test that passes locally and fails in staging. Without a named model you can't even state the bug, so you 'fix' it with a sleep or a refetch and the real violation stays.",
    prereqs: ["db-scaling"],
    unlocks: ["cap-theorem"],
    level1: [
      "Consistency models form a ladder of promises, from expensive to cheap. Linearizable: every operation appears to happen at a single instant, and once a write completes, every subsequent read anywhere sees it. Sequential: everyone sees operations in the same order, but not necessarily in real time. Causal: operations that are causally related are seen in order by everyone; unrelated ones can be seen in any order. Eventual: if writes stop, all copies converge — with no promise about when.",
      "Separately, and often confused with the above, are the session guarantees an application actually cares about: read-your-own-writes (I always see my own change), monotonic reads (I never see time move backward), and read-after-write for others. Most 'we need strong consistency' requirements dissolve into 'we need read-your-own-writes', which is far cheaper to provide.",
      "Note the vocabulary collision: the C in ACID is *not* the C in CAP. ACID consistency means the database enforces your constraints and invariants within a transaction. CAP consistency means linearizability across replicas. They're unrelated properties that share a word, and untangling that in an interview is an instant credibility marker.",
    ],
    level2: [
      {
        heading: "Where a single-node system already has this problem",
        body: "AxonFlux has one Postgres instance, so it has linearizability for free at the storage layer — and it *still* has a consistency story, because copies exist above the database. `derived.*` is a materialized copy of `raw.*`, refreshed only when the pipeline runs, so every dashboard number is stale by construction between runs. That is a deliberate bounded-staleness model: freshness equals 'as of the last rebuild', and it's correct because a supermarket's decisions are daily, not per-second. The frontend holds a third copy — fetched JSON in React state — which is why a mutation that doesn't refetch shows an old number even though the database is perfectly consistent.",
      },
      {
        heading: "Isolation levels: the single-node cousin",
        body: "Within one database, the analogous knob is transaction isolation. Postgres defaults to Read Committed: each statement sees a snapshot taken at statement start, so two statements in one transaction can see different worlds (non-repeatable reads). Repeatable Read gives one snapshot for the whole transaction and can abort with a serialization failure. Serializable behaves as if transactions ran one at a time and pushes retry logic into your application. The practical rule: if a transaction reads values, decides something, and writes based on that decision, Read Committed is not enough — that's the read-modify-write race, and the fixes are SELECT FOR UPDATE, a unique constraint, or a higher isolation level plus retries.",
      },
      {
        heading: "The TRUNCATE window, stated precisely",
        body: "The sharpest consistency artifact in this repo: the pipeline TRUNCATEs and rebuilds `derived.*` on every run, so there is a real window where a dashboard query returns empty tables — not stale data, *missing* data. That's worse than staleness, because stale numbers are merely old while empty numbers look like a business collapse. The named-but-unbuilt fix is blue/green: build into shadow tables (`_next`), then swap with an atomic RENAME inside one transaction, so readers move from the old generation to the new one with no visible intermediate state. Postgres makes this genuinely achievable because its DDL is transactional. Until it's built, the mitigation is operational — the rebuild runs when nobody is looking.",
      },
    ],
    level3: [
      {
        heading: "Why strong consistency costs latency, always",
        body: "Linearizability requires that a write is not acknowledged until enough replicas agree it happened. 'Enough replicas agree' means at least one network round trip to a quorum, so your write latency has a floor set by the slowest node in that quorum — and if the nodes are in different regions, that floor is physics. This is why cross-region strongly-consistent writes cost tens of milliseconds no matter how good your database is, and why systems like Spanner needed atomic clocks to make it tolerable. Eventual consistency is cheap for exactly the opposite reason: acknowledge locally, reconcile later. Every consistency decision is really a latency decision wearing a correctness costume.",
      },
      {
        heading: "Choosing per-operation, not per-system",
        body: "Mature systems don't pick one model — they pick one per operation, driven by the cost of being wrong. In AxonFlux terms: cash closure submission must be strongly consistent and read-your-own-writes, because a staff member re-entering a count they can't see would double-record and the money is real. Dashboard revenue for last week can be a day stale and nobody is harmed. Product health signals are stale by design — they're computed weekly. Basket recommendations can be arbitrarily stale. Writing that table out for your own system, with a cost-of-wrongness column, is the exercise that turns this topic from vocabulary into judgment.",
      },
      {
        heading: "Interview framing",
        body: "'Single Postgres, so linearizable at the storage layer — but I still have three copies of the truth and I can name the model for each: derived.* is bounded-staleness refreshed by the pipeline, the frontend cache is eventually consistent via refetch, and app.* writes are strongly consistent because they're money and human judgment. The known defect is that the derived rebuild TRUNCATEs, so there is a window of *empty* rather than stale reads; the fix is build-into-shadow-tables plus an atomic RENAME, which Postgres supports because its DDL is transactional. I haven't built it because the rebuild runs when nobody is watching — that's a one-store answer and I'd fix it before it was a SaaS.' Distinguishing ACID-C from CAP-C, unprompted, is the other thing that lands.",
      },
    ],
    axonflux:
      "A lightweight version is genuinely present, just not via replication. One Postgres instance means storage-layer linearizability comes free, so no consistency protocol was ever written. But three copies of truth exist anyway: `derived.*` is a materialized copy of `raw.*` with bounded staleness (fresh as of the last pipeline run — correct, because retail decisions are daily); the frontend holds fetched JSON that goes stale until refetch; and `app.*` holds the strongly-consistent writes that matter (cash closure, canonical names, users). The real, documented defect is the rebuild's TRUNCATE window, where dashboards can read *empty* tables mid-rebuild — the named unbuilt fix is blue/green shadow tables plus an atomic RENAME.",
    companies:
      "DynamoDB exposes the choice as an API flag — eventually consistent reads cost half as much as strongly consistent ones, which is consistency pricing made literal. Google Spanner buys external consistency with TrueTime and atomic clocks. Cassandra hands you per-query tunable quorums. Facebook's memcache paper is largely a story about achieving read-your-own-writes over an eventually consistent cache tier.",
    whenNot:
      "Don't demand strong consistency where staleness is harmless — you pay latency and availability for a guarantee nobody uses; a weekly analytics dashboard behind a synchronous quorum is pure waste. Conversely, don't accept eventual consistency for money, inventory decrements, or anything with a uniqueness invariant. And don't invent a custom consistency protocol: this is a category where using a database that already made the guarantee is nearly always correct.",
    files: [
      { path: "pipelines/weekly_pipeline.py", note: "the TRUNCATE-and-rebuild window — where reads can see empty tables" },
      { path: "sql/rebuild_derived/00_daily_sales_summary.sql", note: "first rebuild step; step ordering is itself a consistency contract" },
      { path: "api/models/app.py", note: "app.* — the strongly-consistent, human-authored writes" },
    ],
    interview: [
      {
        q: "Your system is one Postgres instance. Do you still have a consistency model to talk about?",
        a: "Yes, three of them. Storage is linearizable, which I got free and didn't design. Above it, derived.* is a materialized copy refreshed only by the pipeline — bounded staleness, freshness equals last rebuild, and that's a deliberate choice because retail decisions are daily. Above that, the frontend caches fetched JSON, which is eventually consistent until a refetch. Consistency isn't a property of having replicas; it's a property of having more than one copy, and caches and materialized tables are copies.",
      },
      {
        q: "What's the difference between the C in ACID and the C in CAP?",
        a: "They're unrelated. ACID's C means a transaction moves the database from one valid state to another with respect to your declared constraints and invariants — it's about correctness inside one transaction domain. CAP's C is linearizability: all replicas presenting a single, real-time-ordered view of the data. A single-node ACID database is trivially CAP-consistent because there's nothing to disagree with, and a distributed system can be eventually consistent while every individual transaction is fully ACID.",
      },
      {
        q: "You have a mid-rebuild window where dashboards read empty tables. Why is that worse than stale data, and how would you fix it?",
        a: "Stale data is wrong by a bounded amount and still reads as plausible; empty data reads as a catastrophe — a user sees zero revenue and escalates. The fix is to never expose an intermediate generation: build the new tables under shadow names, then swap them in with an atomic RENAME inside a single transaction, which works because Postgres DDL is transactional. Readers see generation N or generation N+1, never a half-built one. I haven't built it because with one store the rebuild runs off-hours, but I'd consider it mandatory before multi-tenant.",
      },
    ],
    mentor: {
      deep: [
        "The ladder: linearizable → sequential → causal → eventual, and what each actually promises",
        "Session guarantees — read-your-own-writes and monotonic reads — because they're what users notice",
        "ACID-C vs CAP-C, permanently untangled",
        "Read-modify-write races and why Read Committed doesn't prevent them",
      ],
      abstract: [
        "Consensus algorithm internals (Raft/Paxos) until you'd implement or operate one",
        "CRDT construction details unless you're building collaborative editing",
      ],
      mistakes: [
        "Assuming 'we use Postgres so we're consistent' once a cache or materialized table exists",
        "Fixing a stale-read bug with a client-side sleep instead of naming the guarantee you need",
        "Using Read Committed for read-decide-write logic without a lock or unique constraint",
        "Demanding strong consistency everywhere and paying latency for guarantees nobody consumes",
      ],
    },
    exercises: [
      "Write the per-operation consistency table for AxonFlux: operation, required model, cost of being wrong. Cash closure vs dashboard revenue vs recommendations.",
      "Implement blue/green for one rebuild step — build into _next, atomic RENAME in one transaction — and measure the window it eliminates.",
      "Reproduce a read-modify-write race with two psql sessions under Read Committed, then fix it three ways: FOR UPDATE, unique constraint, Serializable + retry.",
      "Find one place in the frontend where a mutation doesn't refetch, and describe the exact staleness a user would perceive.",
    ],
    pos: { x: 53, y: 34 },
  },

  // ── CAP ─────────────────────────────────────────────────────────────
  {
    id: "cap-theorem",
    title: "CAP & the Cost of Distribution",
    domain: "systems",
    difficulty: "advanced",
    status: "ready",
    tagline: "the network will cut, choose your regret in advance",
    analogy:
      "Two shop branches sharing one stock ledger. The phone line between them dies. Branch B now has two options and only two: keep selling from a ledger it can no longer verify (available, possibly overselling), or refuse to sell until the line is back (consistent, definitely losing sales). Nobody gets to choose 'the line doesn't die' — that option isn't on the menu, and pretending it is *is* the mistake CAP exists to prevent.",
    problem:
      "Distributed systems failed in confusing ways and teams argued about impossible requirements — 'always available AND always correct across regions'. CAP formalized why that request is incoherent: when the network partitions, a distributed system must sacrifice either consistency or availability. It turned an argument into a decision.",
    withoutIt:
      "You design for the happy path and discover your choice during an incident, unconsciously and badly. Split-brain writes both accepted, two masters diverging, a system that neither serves nor stays correct — and afterwards you cannot even explain what it was supposed to do.",
    prereqs: ["consistency-models"],
    unlocks: ["distributed-architecture"],
    level1: [
      "CAP: consistency, availability, partition tolerance — pick two. The framing is widely misquoted because P is not optional. Networks partition; that's not an architectural choice, it's a property of cables and routers. So for any system spanning machines, the real statement is: *when a partition happens*, you choose C or A. CP systems refuse requests they can't safely serve; AP systems serve them and reconcile afterward.",
      "The crucial qualifier people drop: this is about behavior *during* a partition. When the network is healthy — the overwhelming majority of the time — a well-built distributed system offers both consistency and availability. CAP is a statement about failure behavior, not steady state.",
      "PACELC is the honest extension and the more useful tool: if there is a Partition, choose Availability or Consistency; Else (normal operation), choose Latency or Consistency. That second clause is the one you actually live with daily. Strong consistency isn't only a partition-time cost — it's a latency tax on every single write, forever.",
    ],
    level2: [
      {
        heading: "CP and AP, in concrete terms",
        body: "CP: a partitioned minority side stops accepting writes. etcd, ZooKeeper, and Consul behave this way, which is why Kubernetes control planes go read-only rather than accept conflicting cluster state — for configuration and leader election, being wrong is unrecoverable while being briefly unavailable is survivable. AP: every side keeps serving and conflicts are reconciled later. Cassandra and DynamoDB (in eventually-consistent mode) work this way, and a shopping cart is the canonical case — losing an add-to-cart is worse business than merging two carts later. The pattern is that CP protects invariants and AP protects revenue.",
      },
      {
        heading: "Reconciliation is the AP tax",
        body: "Choosing A means you have accepted divergent writes and now owe a merge strategy. Last-write-wins is simple and silently loses data, and worse, it depends on clocks that are not synchronized between machines. Vector clocks detect concurrency accurately but hand the conflict to your application. CRDTs make conflicts mathematically impossible to lose by restricting operations to those that commute — a set where you can only add, a counter that only increments — which works beautifully until you need 'remove' or a business invariant. The AP choice is cheap at write time and expensive in design time, and teams routinely underestimate the second half.",
      },
      {
        heading: "Why a single node sidesteps the whole theorem",
        body: "AxonFlux has one Postgres instance, one machine, one store. There is no partition to tolerate between replicas, so CAP simply does not apply to its storage layer — a fact worth saying plainly rather than pretending otherwise. What it has instead is the *simplest* availability story possible: the machine is either up or down, and when it's down there is no partial correctness to reason about. That is a real engineering property, not a gap. Total system availability equals one machine's uptime, which for a store that closes at night is entirely adequate, and it buys freedom from every reconciliation problem above.",
      },
    ],
    level3: [
      {
        heading: "The failure mode CAP was really written about: split brain",
        body: "The catastrophic case isn't unavailability, it's two sides both believing they're authoritative and both accepting writes. Recovery means reconciling two divergent histories with no principled answer for which won. Defenses are all forms of 'refuse to act without proof of majority': quorum (a majority must acknowledge, so two majorities can't exist simultaneously), fencing tokens (monotonic epoch numbers so a stale leader's writes are rejected by storage), and leases with timeouts. This is why quorum sizes are odd numbers and why a 2-node cluster is worse than a 1-node one — 2 nodes have no majority when they disagree, so you added a failure mode and gained nothing.",
      },
      {
        heading: "PACELC in daily practice",
        body: "The E-branch is where most real money is spent. Every synchronous cross-region write pays a round trip you cannot optimize away — that's speed-of-light latency, not slow software. So systems get built as: strongly consistent within a region, eventually consistent across regions, with the application deciding which operations must cross. Spanner's answer was to shrink clock uncertainty with GPS and atomic clocks and then simply wait out the uncertainty window on commit — a solution most companies cannot buy. The practical takeaway is that 'global strong consistency' is a budget item, and if nobody has budgeted for it, the design must not assume it.",
      },
      {
        heading: "Interview framing",
        body: "Do not recite 'pick two'. Say: 'CAP only binds during a partition, and P isn't optional, so the real choice is C or A when the network cuts. My system is single-node — CAP doesn't apply to it, and I'd rather say that than invent a distributed story. Where it *would* apply is a multi-store future: I'd go CP for anything with an invariant, cash reconciliation and stock decrements, because being wrong about money is unrecoverable while being briefly unavailable is a phone call. Analytics reads would be AP — a stale dashboard during a partition is fine. And the clause I'd actually live with is PACELC's E: even with no partition, strong consistency taxes every write with a round trip.' Naming split brain and quorum-as-defense is what separates a memorized answer from an understood one.",
      },
    ],
    axonflux:
      "Deliberately not applicable, and that is the honest answer rather than a hole. AxonFlux is a single Postgres instance on a single machine serving a single store — there is no replica set, so there is no partition between nodes and therefore no CAP trade-off to make. Availability equals one machine's uptime, which is adequate for a shop with fixed hours, and in exchange the system owes zero reconciliation logic, zero quorum configuration, and has no possible split brain. The trade-off is conscious: a distributed store would buy uptime and cost conflict resolution, ops burden, and a class of bug that is very hard to reason about solo. If this ever became multi-store, the split would be CP for cash and stock invariants, AP for analytics reads.",
    companies:
      "etcd and ZooKeeper are CP by design, which is why a partitioned Kubernetes control plane stops accepting changes instead of forking. DynamoDB and Cassandra grew from Amazon's AP shopping-cart lineage. MongoDB is CP with a configurable write-concern dial that lets you trade toward A. Spanner claims effective CA in practice only because Google owns a private network engineered to partition extremely rarely.",
    whenNot:
      "CAP is irrelevant to single-node systems — invoking it there is a tell that the vocabulary is borrowed. It also doesn't apply within one datacenter rack in any meaningful operational sense, and it says nothing about performance, which is why PACELC exists. Most importantly, don't distribute a system to 'be CAP-aware'; distribution is the cost, and CAP is just the invoice.",
    files: [],
    interview: [
      {
        q: "Where does your system sit on CAP?",
        a: "Nowhere — and I think saying that is more useful than inventing a position. It's a single Postgres instance on one machine for one store, so there are no replicas to partition and no C-vs-A choice exists. Availability is one machine's uptime, which suits a business with opening hours. What I get in exchange is real: no reconciliation logic, no quorum config, no split brain possible. If it went multi-store I'd split by invariant — CP for cash reconciliation and stock, because wrong money is unrecoverable, and AP for analytics, because a stale dashboard during a partition harms nobody.",
      },
      {
        q: "Why is a two-node cluster often worse than a single node?",
        a: "Because two nodes can't form a majority when they disagree. Under a partition each side sees one node up and one down and has no way to distinguish 'peer is dead' from 'peer is unreachable but alive'. If both keep serving you get split brain; if both stop you've halved your availability while doubling your hardware and operational surface. Quorum needs an odd number so a majority always exists on exactly one side — that's why three is the smallest cluster size that actually buys you anything.",
      },
      {
        q: "What does PACELC add that CAP misses?",
        a: "The else-branch, which is where you spend nearly all your time. CAP only describes partition behavior; PACELC says that even with a healthy network you're choosing between latency and consistency, because a strongly consistent write requires a quorum round trip on every write forever. That's the clause that shows up on latency dashboards and in cloud bills. It also reframes eventual consistency honestly — often it's chosen not for partition survival but because a cross-region round trip per write is unaffordable.",
      },
    ],
    mentor: {
      deep: [
        "P is not optional — the choice is C or A, and only during a partition",
        "Split brain and the quorum/fencing defenses against it",
        "PACELC's else-branch: the latency tax on every consistent write",
      ],
      abstract: [
        "Formal proofs of the theorem",
        "CRDT algebra unless you build collaborative or offline-first software",
      ],
      mistakes: [
        "Reciting 'pick two' as though P were a menu item",
        "Claiming a CAP position for a single-node system",
        "Last-write-wins conflict resolution on unsynchronized clocks",
        "Running a 2-node cluster and believing it's more available than 1",
      ],
    },
    exercises: [
      "Write the multi-store version of AxonFlux and classify each operation CP or AP with a one-line justification tied to cost of being wrong.",
      "Read the Dynamo paper's conflict-resolution section and summarize why a shopping cart tolerates merge but an inventory decrement does not.",
      "Draw the split-brain timeline for a hypothetical 2-replica AxonFlux where both sides accept a cash closure for the same date.",
      "Price the E-branch: estimate the added per-write latency if app.* writes needed synchronous acknowledgement from a replica in another region.",
    ],
    pos: { x: 62, y: 46 },
  },

  // ── SERVICE BOUNDARIES ──────────────────────────────────────────────
  {
    id: "microservices-tradeoff",
    title: "Microservices vs the Modular Monolith",
    domain: "systems",
    difficulty: "intermediate",
    status: "ready",
    tagline: "modularity is free, distribution is not",
    analogy:
      "One kitchen with clearly separated stations — grill, prep, bakery — versus three separate restaurants across town that phone each other. Both give you specialization and clear ownership. Only the second one lets each restaurant renovate independently, and only the second one has orders lost on the phone line, three sets of accounts, and a meal that fails because the bakery's line was busy. The stations were free; the separate buildings were not.",
    problem:
      "Large organizations found that a single codebase deployed by hundreds of engineers becomes a coordination bottleneck — one team's bug blocks everyone's release, and one component's memory appetite forces the whole app onto bigger machines. Microservices solve *that*: independent deployment, independent scaling, independent team ownership.",
    withoutIt:
      "At genuine organizational scale, without service boundaries every deploy is a cross-team negotiation, one hot component dictates the whole fleet's machine size, and a memory leak in a rarely used feature takes down billing. At small scale, the absence of microservices costs precisely nothing.",
    prereqs: ["load-balancing"],
    unlocks: ["distributed-architecture"],
    level1: [
      "Microservices split an application into independently deployable services communicating over the network. The benefits are real and specific: independent deploy cadence, independent scaling per service, technology heterogeneity, and fault isolation — if the boundaries are correct.",
      "The costs are equally specific and much less discussed: every in-process function call that becomes a network call gains latency, partial failure, retries, timeouts, and serialization. Transactions that were one ACID commit become sagas with compensating actions. A stack trace becomes a distributed trace. Local development needs an orchestrator. Debugging requires correlation IDs across services you didn't write.",
      "The key insight, and the one that reframes the whole debate: the thing you want is *modularity* — clear boundaries, explicit interfaces, low coupling. Modularity is achievable inside one process for free. Microservices are modularity plus a network, and the network is the entire bill. So the real question is never 'monolith or microservices', it's 'do I have an organizational or scaling problem that only a network boundary solves?'",
    ],
    level2: [
      {
        heading: "Conway's Law is the actual decision input",
        body: "Service boundaries that don't match team boundaries produce the worst of both worlds: a change requires editing three services, coordinating three deploys, and versioning two APIs — a distributed monolith, which is strictly worse than a monolith because it has all the coupling plus all the network. The rule of thumb that holds up: split when a boundary has an *owner*. One developer means one owner means one service. AxonFlux has exactly one developer, which by itself settles the question, and saying so is a stronger argument than any technical one.",
      },
      {
        heading: "What a modular monolith looks like here",
        body: "AxonFlux is a monolith, but not a mud ball, and the difference is visible in the tool plugin system. Each internal staff tool — cash closure, pamphlets, campaign studio, entity resolution — lives in `api/tools/<name>/` with a MANIFEST and its own APIRouter, and `register_tools()` auto-discovers and mounts it. Adding a tool requires zero edits to `main.py`. That's a plugin boundary with an explicit contract and independent internals: the modularity benefit, achieved with an import loop instead of a service mesh. If a tool ever needed independent deploy or independent scale, that folder is already the seam to cut along — which is the real payoff of clean module boundaries in a monolith.",
      },
      {
        heading: "The one place AxonFlux genuinely does cross a process boundary",
        body: "The pipeline runs as a subprocess: `POST /api/pipeline/trigger` shells out to `pipelines/weekly_pipeline.py` rather than importing it. That decision is deliberate — a minutes-long CPU-and-IO-heavy rebuild must not run inside an API worker, and the process boundary means a pipeline crash cannot take down the API. But note what it already cost, even at this tiny scale: no shared memory for status (hence `app.pipeline_runs` as a status table), no in-process lock (hence the documented TRUNCATE race), and observability that stops at stdout. One process boundary bought isolation and immediately created three distributed-systems problems in miniature. Multiply that by twelve services and you have the microservices bill in a sentence.",
      },
    ],
    level3: [
      {
        heading: "The distributed monolith — the failure everyone actually hits",
        body: "Services split by technical layer instead of business capability produce lockstep coupling: an 'API service', a 'business logic service', and a 'data service' means every feature touches all three, every deploy is coordinated, and you have added network latency and partial failure to what was a function call. The diagnostic questions are blunt. Can this service be deployed alone? Does it own its data, or does it read another service's tables? Does a typical feature touch one service or several? Two 'no's and you have a distributed monolith, and the correct fix is usually to merge services back — an unpopular but frequently right answer.",
      },
      {
        heading: "What splitting costs that no one budgets for",
        body: "Data ownership: each service owns its database, so joins across services become application-side joins or duplicated data with sync jobs. Transactions: a single ACID commit becomes a saga with explicit compensating actions for every step, and compensations are business logic you must design and test. Versioning: an interface change now requires backward compatibility across a deploy window, because the caller and callee update at different times. Testing: integration tests need multiple services running. Observability stops being optional — without distributed tracing you cannot answer 'why was this request slow', which is why systems-observability is a hard prerequisite for distribution rather than a nice-to-have.",
      },
      {
        heading: "Interview framing",
        body: "'Modular monolith, deliberately. One developer, one store — service boundaries that don't match team boundaries just buy network latency and partial failure for zero organizational gain. I got the modularity anyway: tools are auto-discovered plugins with a manifest contract and zero core edits, so the seams to cut along already exist. And I know the cost concretely, because the one process boundary I *did* cross — running the pipeline as a subprocess for crash isolation — immediately created three distributed problems: status has to go through a database table, there's no in-process lock so concurrent triggers race on TRUNCATE, and observability stops at stdout. My trigger for splitting is organizational, not technical: a second team, or a component whose scaling profile genuinely differs.'",
      },
    ],
    axonflux:
      "Deliberately rejected, and named as such in the project's own roadmap alongside Kafka, a dedicated vector DB, and a workflow orchestrator. The reason is organizational, not technical: one store, one developer, one machine — service boundaries that don't match team boundaries buy network latency and partial failure for no gain. What was built instead is a genuinely modular monolith: `api/tools/<name>/` plugins with a MANIFEST + APIRouter, auto-discovered by `register_tools()`, so adding a tool touches zero core files. Those folders are pre-cut seams if a split ever pays. And the project already pays the distribution tax in one place — the pipeline runs as a subprocess for crash isolation, which cost it in-process status (now `app.pipeline_runs`), an in-process lock (hence the known TRUNCATE race), and observability beyond stdout.",
    companies:
      "Amazon's two-pizza teams made services an org structure first and an architecture second. Netflix's split followed hundreds of engineers and per-component scaling needs. The counter-examples matter more for calibration: Shopify, GitHub, and Stack Overflow run enormous modular monoliths, and Segment publicly merged its microservices back into a monolith after the operational cost exceeded the benefit.",
    whenNot:
      "Don't split with one team, don't split before you know your domain boundaries (early splits calcify wrong boundaries into network APIs that are painful to move), and don't split for scaling when the actual bottleneck is the shared database — N services hitting one Postgres is still one Postgres. Also don't split without observability already in place; distributed systems without tracing are undebuggable, and the debt compounds immediately.",
    files: [
      { path: "api/tools/__init__.py", note: "register_tools() — plugin auto-discovery; modularity without a network" },
      { path: "api/main.py", note: "the single app that never changes when a tool is added" },
      { path: "api/routers/pipeline.py", note: "the one real process boundary — subprocess trigger, and its costs" },
      { path: "docs/architecture/tool-plugins.md", note: "the module contract, written down" },
    ],
    interview: [
      {
        q: "Why didn't you use microservices?",
        a: "Because the benefits are organizational and I'm one developer serving one store. Independent deploy cadence, independent team ownership, per-service scaling — none of those problems exist here, and paying network latency, partial failure, and saga-based transactions for benefits you can't consume is negative value. I did want modularity, so I built a plugin system: each tool is a folder with a manifest and a router, auto-discovered at startup, zero edits to main.py. Those are the seams I'd cut along if a component ever needed its own deploy cadence — which is the trigger, and it's an organizational one.",
      },
      {
        q: "What's a distributed monolith and how would you detect one?",
        a: "Services that must be deployed together — usually the result of splitting by technical layer instead of business capability. You detect it with three questions: can this service ship alone, does it own its data or read someone else's tables, and does a typical feature touch one service or several? If features routinely span services and deploys must be coordinated, you have all the coupling of a monolith plus network latency and partial failure. The right fix is often merging services back, which teams resist because it reads as a retreat rather than as a correction.",
      },
      {
        q: "You already run the pipeline as a subprocess. Isn't that already a service?",
        a: "It's a process boundary, and it's instructive because it bought exactly one thing — a heavy rebuild can't take down the API — and immediately charged me three. Status can't be shared in memory, so it goes through app.pipeline_runs. Mutual exclusion can't be a Python lock, so concurrent triggers race on TRUNCATE and single-flight locking is still an unbuilt fix. And logs are just stdout on both sides, so correlating a failure means reading two streams. That's the microservices bill at n=1, which is the cheapest possible way to learn what it looks like at n=12.",
      },
    ],
    mentor: {
      deep: [
        "Modularity is the goal; distribution is a cost you pay only for organizational or scaling reasons",
        "Conway's Law as the real boundary-drawing input",
        "The distributed monolith and how to diagnose it",
        "What one process boundary actually costs — visible in this repo's pipeline subprocess",
      ],
      abstract: [
        "Service mesh internals (Istio/Linkerd) until you operate one",
        "Kubernetes operator specifics",
      ],
      mistakes: [
        "Splitting by technical layer instead of business capability",
        "Splitting before the domain boundaries are understood",
        "Assuming microservices fix performance — they usually add latency",
        "Adopting the architecture of a company with 500 engineers while having 1",
      ],
    },
    exercises: [
      "Pick one tool in api/tools/ and write the exact contract it would need as a standalone service: endpoints, data it owns, what breaks when it's down.",
      "Trace one feature end-to-end and count how many modules it touches; that count is your coupling estimate for a hypothetical split.",
      "List every implicit shared-database join between tools and the app layer — each is a data-ownership violation a split would surface.",
      "Write the saga for cash closure if verification lived in a separate service: steps, failure points, compensating actions.",
    ],
    pos: { x: 53, y: 58 },
  },

  // ── OBSERVABILITY ───────────────────────────────────────────────────
  {
    id: "systems-observability",
    title: "Observability: Logs, Metrics, Traces",
    domain: "systems",
    difficulty: "intermediate",
    status: "ready",
    tagline: "can you answer a question you didn't anticipate",
    analogy:
      "A hospital patient. The chart of everything that happened is the log. The bedside monitor showing heart rate and blood pressure as numbers over time is metrics. Following a single dose of medication through the body, organ by organ, is a trace. Monitoring tells you the heart rate is high — a known question with a known threshold. Observability is having enough instrumentation to answer *why* it's high without ordering a new test, and that distinction is the whole subject.",
    problem:
      "Production systems fail in ways nobody predicted, and the failures that matter are usually conditional — slow only for one customer, only on Mondays, only when a cache is cold. Dashboards built for anticipated questions are useless for those. You need data rich enough to slice by dimensions you didn't think of in advance.",
    withoutIt:
      "Debugging becomes guesswork plus redeploys. 'It's slow' cannot be localized, so you add print statements and wait for it to happen again. Incidents are detected by users rather than by systems, and post-mortems produce opinions instead of timelines.",
    prereqs: [],
    unlocks: ["distributed-architecture"],
    level1: [
      "Three signals, three jobs. Logs are discrete events with context — high detail, high volume, expensive to store, perfect for 'what exactly happened at 14:32'. Metrics are numeric time series with labels — cheap, aggregatable, ideal for 'is it happening more than usual' and for alerting. Traces follow one request across every component it touched, with timing per hop — the only signal that answers 'where did the time go'.",
      "The trick that makes logs actually useful is making them structured. `logger.info('user %s failed login', uid)` produces prose a machine cannot query. A JSON event with fields — event, user_id, ip, duration_ms, request_id — can be filtered, grouped, and counted. Structured logging is the cheapest observability upgrade in existence and the one most often skipped.",
      "Then there's the alerting discipline, which is where most teams go wrong: alert on symptoms users feel (error rate, latency, request failures), not on causes (CPU is high). High CPU with happy users is not an incident. A page that fires for something nobody noticed trains everyone to ignore pages, and alert fatigue kills more incident response than missing alerts do.",
    ],
    level2: [
      {
        heading: "Correlation IDs — the one thing to build first",
        body: "Generate an ID at the edge of every request, attach it to every log line, propagate it through every downstream call, and return it in error responses. Now a user reporting 'it broke at 3pm' hands you an ID and every line for that request is one filter away. This is the foundation traces are built on, it costs one middleware, and it's worth more than any dashboard. In AxonFlux the natural correlation key already exists for data lineage — `import_batch_id` ties every raw row to the file and run that produced it, which is exactly the same idea applied to data instead of requests.",
      },
      {
        heading: "Percentiles, and why averages lie",
        body: "Average latency is nearly useless: 99 requests at 10ms and one at 5s averages to 60ms, which describes no actual user's experience. Report p50 (typical), p95, and p99 (the tail your unhappiest users live in). Tail latency is where real problems hide — connection pool exhaustion, a cold cache, one slow shard. There's a compounding effect worth internalizing: if a page makes 10 backend calls and each has a 1% chance of being slow, roughly 1 in 10 page loads is slow. Tail latency at the component level becomes typical latency at the page level, which is why p99 is a product metric and not just an engineering one.",
      },
      {
        heading: "SLIs, SLOs, and error budgets",
        body: "An SLI is a measured indicator (fraction of requests under 200ms). An SLO is the target (99% over 30 days). The error budget is the remainder — 1% of requests may be slow, and that budget is a spending decision, not a failure. Burn it fast and you freeze risky deploys; leave it unspent and you were too conservative to ship. This reframes reliability from 'never break' to 'break within an agreed budget', which is the only version that survives contact with shipping features. Even for a one-store internal tool, writing one SLO — 'dashboard loads under 2s during store hours' — turns vague performance anxiety into a number.",
      },
    ],
    level3: [
      {
        heading: "Cardinality, the thing that quietly bankrupts you",
        body: "Metrics systems store one time series per unique label combination. Add `user_id` as a label with 10,000 users and you have 10,000 series per metric; add `barcode` in a supermarket catalog and it's tens of thousands more; multiply by other labels and you have a cardinality explosion that takes down the metrics backend — which classically happens *during* an incident, when you lose observability exactly when you need it. The rule: metrics get bounded labels (endpoint, status code, region), and unbounded identifiers (user id, barcode, request id) belong in logs and traces where per-event storage is the model.",
      },
      {
        heading: "Sampling, and what you must never sample away",
        body: "Traces at full volume are unaffordable at scale, so you sample — but naive head sampling drops the interesting requests, because errors and slow requests are rare by definition. Tail-based sampling decides after the request completes: keep everything that errored or exceeded a latency threshold, keep a small percentage of the boring ones. That preserves the signal and discards the bulk. The general principle applies beyond tracing: when you reduce data volume, bias the reduction toward keeping anomalies, because anomalies are the entire reason the data exists.",
      },
      {
        heading: "Interview framing",
        body: "The honest version: 'Observability is the biggest gap in this system and I can describe it precisely. Logs are process stdout — unstructured, unaggregated, not searchable. There are no metrics and no tracing. The one real piece of instrumentation is app.pipeline_runs, a job-audit table recording each pipeline run's status and timing, which is a primitive but genuine observability primitive — I can answer did it run, did it succeed, how long did it take. The reason the gap is acceptable is that there is one process, one machine, and I am the only operator, so the log stream and the failure are in the same terminal. The reason it stops being acceptable is the moment there is a second process, a second operator, or a public storefront — at which point structured JSON logs with a request-id middleware is the first thing I build, before metrics, because correlation is what makes everything else useful.' Being specific about a gap beats claiming a stack you don't run.",
      },
    ],
    axonflux:
      "Mostly absent, and honestly so. Logs are process stdout — unstructured, unaggregated, not searchable. There are no metrics, no dashboards, and no distributed tracing, because there is nothing distributed to trace: one uvicorn process, one machine, one operator who is also the developer. The one real piece of observability infrastructure is `app.pipeline_runs`, a job-audit table recording each pipeline run's status and timing — primitive, but it answers did it run, did it succeed, and how long it took, which is exactly what a job needs. Data lineage is comparatively strong: `import_batch_id` and `source_file_name` on every raw row make any dashboard number traceable back to the file that produced it, which is correlation-ID thinking applied to data. The named first step when this stops being enough is structured JSON logging plus a request-id middleware — before metrics, because correlation is what makes every other signal usable.",
    companies:
      "Google's SRE book defined the SLO/error-budget discipline the industry now copies. Datadog, Honeycomb, and Grafana sell the three signals; Honeycomb's whole pitch is high-cardinality event data precisely because metrics can't answer unanticipated questions. OpenTelemetry standardized instrumentation so the vendor choice stops being a rewrite. Prometheus made pull-based metrics with labels the default mental model.",
    whenNot:
      "Don't buy an observability platform for a single-process internal tool — stdout and a job-status table genuinely suffice when the operator and the developer are the same person in the same terminal. Don't instrument everything preemptively; instrumentation has runtime cost and cardinality cost, and unread dashboards are pure overhead. And don't build dashboards before you have alerts: a dashboard nobody is looking at during the failure detected nothing.",
    files: [
      { path: "api/models/app.py", note: "app.pipeline_runs — the job-audit table; the closest thing to observability here" },
      { path: "api/routers/pipeline.py", note: "writes run status; where structured logging would start" },
      { path: "raw_ingestion/common/ingest_core.py", note: "import_batch_id + source_file_name — correlation IDs for data lineage" },
    ],
    interview: [
      {
        q: "What's your observability story?",
        a: "Thin, and I'd rather describe it accurately than overstate it. Logs are stdout, there are no metrics and no tracing, and the one genuine primitive is app.pipeline_runs — a job-audit table with status and timing per run, which answers did it run, did it succeed, how long. That's acceptable because there's one process on one machine and I'm the only operator, so the failure and the log stream are in the same terminal. It stops being acceptable at a second process, a second operator, or public traffic, and the first thing I'd add is structured JSON logs with a request-id middleware — correlation before metrics, because an ID that ties a user's complaint to every line of their request is worth more than any dashboard.",
      },
      {
        q: "Why is high-cardinality data a problem for metrics but not for logs?",
        a: "Metrics systems store one time series per unique label combination, so adding an unbounded label like user_id or barcode multiplies your series count without bound and can take down the metrics backend — usually during an incident, when you lose visibility precisely when you need it. Logs and traces are per-event storage, so an arbitrary identifier per event costs one field, not one new series. That's the split: bounded dimensions like endpoint and status code become metric labels; identities go in logs and traces.",
      },
      {
        q: "Why alert on symptoms rather than causes?",
        a: "Because causes don't correlate reliably with user harm. High CPU with a healthy error rate and normal latency is not an incident, and paging for it trains people to ignore pages — alert fatigue does more damage than missing alerts. Symptom alerts, which is what error rate and latency and availability are, fire when users are actually affected, and the cause metrics are then what you use to *diagnose* after the page. It also keeps alerts stable across refactors, since the symptom stays meaningful even when the internals change completely.",
      },
    ],
    mentor: {
      deep: [
        "The three signals and which question each one is for",
        "Correlation IDs — build this before anything else",
        "Percentiles over averages, and how component tail latency becomes page-level typical latency",
        "Cardinality limits, and why they bite hardest during incidents",
      ],
      abstract: [
        "Specific vendor query languages until you pick one",
        "OpenTelemetry collector configuration details",
      ],
      mistakes: [
        "Unstructured string logs that can't be queried",
        "Alerting on causes (CPU) instead of symptoms (errors, latency)",
        "Putting user ids or barcodes in metric labels",
        "Reporting average latency and believing the system is fast",
        "Building dashboards before alerts — nobody watches a dashboard during the failure",
      ],
    },
    exercises: [
      "Add a request-id middleware to the FastAPI app that generates an ID, binds it to every log line for that request, and returns it in error responses.",
      "Convert one router's logging to structured JSON and write three queries you could now answer that you couldn't before.",
      "Write one SLO for the dashboard — an SLI, a target, a window — and instrument enough to measure whether it's met.",
      "List every metric label you'd want for this API and mark each bounded or unbounded; delete the unbounded ones and move them to logs.",
    ],
    pos: { x: 62, y: 70 },
  },

  // ── SYNTHESIS ───────────────────────────────────────────────────────
  {
    id: "distributed-architecture",
    title: "Distributed Architecture in Practice",
    domain: "systems",
    difficulty: "advanced",
    status: "ready",
    tagline: "the bill arrives before the benefit",
    analogy:
      "Moving your one-kitchen restaurant into a chain across a city. Every advantage is real — more seats, a branch that survives a fire, teams that renovate independently. Every cost is also real and arrives immediately: deliveries between branches get lost, the branches disagree about the menu, and a single customer complaint now requires phoning four managers to reconstruct what happened. The mistake is never building the chain. The mistake is building the chain to serve one street.",
    problem:
      "Every technique in this domain — replicas, balancers, quorums, services, tracing — solves a problem created by having more than one machine. Distribution is what you do when one machine genuinely cannot do the job, whether from load, data volume, fault tolerance, or geography. The engineering skill is knowing which of those four you actually have, because the answer determines everything and 'it feels small' is not one of them.",
    withoutIt:
      "Two symmetrical failures. Distribute too early and you spend your entire budget on coordination — sagas, tracing, deploy orchestration — for a workload one box handled, and you ship nothing. Distribute too late and you hit the ceiling with no seams to cut along, a single database everything joins across, and a rewrite instead of a migration.",
    prereqs: ["cap-theorem", "microservices-tradeoff", "systems-observability"],
    unlocks: [],
    level1: [
      "There are exactly four legitimate reasons to distribute. Load: one machine can't serve the traffic. Data: the dataset won't fit or can't be indexed on one machine. Fault tolerance: the business cannot survive one machine's downtime. Geography: users are far away and the speed of light is the latency floor. Every distributed system should be traceable to one of these; if you can't name yours, you're distributing for aesthetics.",
      "The moment you distribute, four guarantees you had for free disappear. Function calls become network calls that can fail *partially* — the hardest failure mode, because 'no response' doesn't tell you whether the work happened. One clock becomes many unsynchronized clocks, so 'which happened first' stops being answerable from timestamps. One transaction becomes a saga with compensations you must design. And one stack trace becomes a distributed trace, which only exists if you built it beforehand.",
      "AxonFlux is a deliberate, documented non-distributed system: one Postgres, one API process, one machine, accessed over Tailscale, serving one store. Its roadmap explicitly lists Kafka, a dedicated vector database, a workflow orchestrator, and microservices as *rejected* — one store, one developer, one machine. That list is the most senior artifact in the project, because rejecting technology with a written reason is a harder engineering act than adopting it.",
    ],
    level2: [
      {
        heading: "Partial failure is the concept that changes how you write code",
        body: "In one process a function either returns or raises. Over a network there's a third outcome: no answer. The request may have been lost before arrival, or executed and lost on the way back — and those require opposite responses. This is why retries demand idempotency (a retried non-idempotent operation double-charges), why timeouts are mandatory (without one you wait forever and exhaust the caller's connections), and why circuit breakers exist (after N failures, fail fast instead of queueing requests against a dead dependency). AxonFlux already touches this in miniature: `web/app/api/chat-proxy/route.ts` exists solely because a long AI request exceeded a 30-second platform timeout — an intermediary enforcing a limit the application never had, which is the most common shape of distributed-systems surprise.",
      },
      {
        heading: "Time, ordering, and why timestamps lie",
        body: "Machine clocks drift and NTP corrections can step time backward, so ordering two events on two machines by wall clock is unreliable — and this causes real data loss, because last-write-wins conflict resolution is built on exactly that unreliable comparison. The alternatives are logical: Lamport clocks give a total order consistent with causality, vector clocks detect true concurrency, and monotonic sequence numbers or fencing tokens let storage reject a stale leader's writes. AxonFlux avoids all of it by having one clock — which is why its ordering contract is a simple, checkable rule: rebuild step 00 runs before 01, because 01 anchors its date spine on 00's MIN date. Sequencing is trivial when there's one sequencer.",
      },
      {
        heading: "The migration path, if it ever comes",
        body: "If AxonFlux grew to many stores, the order is dictated by cost, not excitement. First, exhaust one machine: vertical scale, indexes, materialization — this repo already got a 12× win by turning a heavy-CTE VIEW into a TABLE, which cost nothing infrastructural. Second, fix the known single-node defects, because they become far worse when distributed: single-flight locking on the pipeline trigger, and blue/green shadow-table swaps to eliminate the TRUNCATE window. Third, add observability — structured logs and correlation IDs — *before* adding components, because you cannot debug what you cannot correlate. Only then: read replicas for reporting, then partitioning, then sharding by store_id. Splitting into services would come last and only for organizational reasons, and might never be right.",
      },
    ],
    level3: [
      {
        heading: "Fallacies of distributed computing, applied",
        body: "The classic list — the network is reliable, latency is zero, bandwidth is infinite, the network is secure, topology doesn't change, there is one administrator, transport cost is zero, the network is homogeneous — is not trivia. Each names a place where code written for one process silently breaks in many. 'Latency is zero' is why an ORM lazy-loading in a loop becomes an N+1 across a network boundary and a page takes 8 seconds. 'The network is reliable' is why every remote call needs a timeout and a retry policy. The reason to memorize the list is that each fallacy maps to a specific defensive pattern, and the patterns are what you actually ship.",
      },
      {
        heading: "The honest cost of one more moving part",
        body: "Every component added to a system multiplies rather than adds: it can fail independently, it needs monitoring, it needs a deploy path, it needs someone who understands it at 2am, and it interacts with every existing component. For a solo developer this compounds brutally — the constraint isn't the machine's capacity, it's the operator's. That reframing is what makes AxonFlux's rejected-technology list defensible rather than lazy: Kafka would be one more thing to operate for one event per pipeline run; a dedicated vector database would be one more datastore when pgvector lives in the Postgres already running; a workflow orchestrator would be Airflow's operational surface for a ten-step SQL script with a documented ordering contract. Each rejection has a named trigger, and having the trigger written down is what makes it a decision instead of an omission.",
      },
      {
        heading: "Interview framing",
        body: "'It's deliberately not distributed — one Postgres, one API process, one machine, one store — and the reason I can defend that is I know the four legitimate triggers and I have none of them: load fits, data fits, downtime overnight is acceptable for a shop with opening hours, and all users are on one tailnet. My roadmap names Kafka, a vector database, a workflow orchestrator, and microservices as rejected, each with the scale that would flip it. I also know the two defects the single-node design lets me get away with: the pipeline trigger has no single-flight lock so concurrent triggers race on TRUNCATE, and the rebuild TRUNCATEs so there's a window of empty reads — both would be mandatory fixes before anything distributed, along with structured logging and correlation IDs, because you should never add components you can't correlate.' Every senior interviewer has met engineers who distribute by reflex; the differentiator is being able to say what one machine can still do and exactly when it stops.",
      },
    ],
    axonflux:
      "Deliberately not distributed, and this is the project's signature decision rather than an unfinished feature. One Postgres, one FastAPI process, one machine, reached over Tailscale, serving one store's staff — none of the four triggers for distribution (load, data volume, fault tolerance, geography) is present. The roadmap explicitly records Kafka, a dedicated vector DB, a workflow orchestrator, and microservices as rejected, each because of one store, one developer, one machine. What the project does own is the list of what it would fix first: single-flight locking on the pipeline trigger (concurrent triggers currently race on TRUNCATE), blue/green shadow-table swaps to close the empty-read window during rebuilds, and structured logging with correlation IDs before any new component is added. The one planned step outward is a public Vercel storefront — and notably that's a static export, distribution of *content* rather than of state, which is the cheapest kind.",
    companies:
      "Stack Overflow served enormous traffic from a handful of servers for years and wrote about it, which remains the best counterweight to distribute-by-default. Segment publicly merged microservices back into a monolith when operational cost exceeded benefit. Amazon and Netflix distributed because they genuinely hit load, fault-tolerance, and organizational limits — the useful lesson from them is the trigger, not the architecture diagram.",
    whenNot:
      "Don't distribute when one machine still fits, when you can't name which of the four triggers you have, when you lack the observability to debug it, or when the operator count is one. Also be honest that distribution isn't free uptime: more components means more independent failure modes, and a poorly operated distributed system is measurably less available than a well-operated single box.",
    files: [
      { path: "CLAUDE.md", note: "the roadmap where rejected technologies and their reasons are recorded" },
      { path: "pipelines/weekly_pipeline.py", note: "ten sequential SQL steps — the workflow orchestrator that wasn't needed" },
      { path: "api/routers/pipeline.py", note: "subprocess trigger; single-flight locking is the named unbuilt fix" },
      { path: "web/app/api/chat-proxy/route.ts", note: "a 30s platform timeout worked around — an intermediary's limit, distributed-systems flavored" },
    ],
    interview: [
      {
        q: "Design AxonFlux for 500 stores. What changes first?",
        a: "Not the architecture — the measurements. First I'd find which of the four triggers actually fires: 500 stores is maybe 500× the data, so derived.product_daily_metrics goes from 2.3M rows to roughly a billion, and that's a data trigger, not a load trigger, since staff traffic is still tiny. So: date partitioning on the metrics tables, a read replica so reporting stops contending with the rebuild, and store_id as the tenant key everywhere — it's already the natural query boundary, which makes it the safe shard key later. Before any of that I'd fix the two known single-node defects, single-flight locking and blue/green swaps, because both get dramatically worse distributed. Services would come last and only if there were multiple teams.",
      },
      {
        q: "What's the most senior decision in this project?",
        a: "The rejections. Kafka, a dedicated vector database, a workflow orchestrator, and microservices are all written down as deliberately not used, each with the reason and the scale that would flip it. Adopting technology is easy and looks impressive; declining it requires knowing what it costs and what problem it solves, and being confident you have neither. The corollary is that I know exactly what I'm getting away with — no single-flight lock on the pipeline, a TRUNCATE window with empty reads, logs that are just stdout — and those are documented too, because a list of rejections without a list of known defects is marketing rather than engineering.",
      },
      {
        q: "What is partial failure and why does it change how you write code?",
        a: "In one process a call returns or raises. Across a network there's a third outcome — no answer — and it's ambiguous: the request may never have arrived, or it may have executed and the response was lost. Those require opposite handling, and you can't distinguish them from the caller. That single ambiguity is why retries require idempotent operations, why every remote call needs an explicit timeout, and why circuit breakers exist to stop piling requests onto a dead dependency. It's also why idempotency stops being a nicety and becomes structural: at-least-once delivery plus idempotent processing is the only honest path to effectively-once behavior.",
      },
    ],
    mentor: {
      deep: [
        "The four triggers for distribution, and being able to name which one you have",
        "Partial failure and its consequences: timeouts, retries, idempotency, circuit breakers",
        "Why unsynchronized clocks make timestamp ordering unsafe",
        "The operator-capacity constraint — every component costs someone's attention at 2am",
      ],
      abstract: [
        "Consensus implementation details until you'd operate a cluster",
        "Service mesh and orchestrator internals",
      ],
      mistakes: [
        "Distributing for résumé reasons and calling it scalability",
        "Retrying non-idempotent operations",
        "Remote calls without timeouts",
        "Adding components before adding the observability to debug them",
        "Believing more components automatically means higher availability",
      ],
    },
    exercises: [
      "Write the 500-store migration plan as an ordered list with a measurable trigger for each step, not a target architecture diagram.",
      "For each rejected technology in the roadmap — Kafka, vector DB, orchestrator, microservices — write the single metric whose threshold would reverse the decision.",
      "Implement single-flight locking on the pipeline trigger with a Postgres advisory lock; verify with two concurrent triggers.",
      "Audit every outbound network call in the codebase (LLM providers, image search, storage) for an explicit timeout and a retry policy; fix the ones missing both.",
    ],
    pos: { x: 53, y: 82 },
  },
];
