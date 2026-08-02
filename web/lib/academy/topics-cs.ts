import type { Topic } from "./types";

// Computer Science fundamentals.
// House rules for this file:
//  1. Intuition (analogy) always lands before terminology.
//  2. Every AxonFlux claim points at code that actually exists. Where a concept
//     is genuinely not used in this project, the `axonflux` field says so in
//     plain words and `files` is empty. Inventing a connection would make the
//     whole Academy untrustworthy, which costs more than an honest gap.

export const CS_TOPICS: Topic[] = [
  // ── 1. ARRAYS & MEMORY ──────────────────────────────────────────────
  {
    id: "arrays-memory",
    title: "Arrays & Memory Layout",
    domain: "cs",
    difficulty: "beginner",
    status: "ready",
    tagline: "contiguous bytes beat clever pointers",
    analogy:
      "Picture a street of numbered houses versus a treasure hunt. On the numbered street, house 4,912 is one calculation away — you walk straight to it. In the treasure hunt, every clue points to where the next clue is hidden, so reaching the 4,912th item means visiting 4,911 others first. An array is the street. A linked list is the treasure hunt. Both 'store a list', and on real hardware the street wins by a margin most people find shocking.",
    problem:
      "Memory is a flat numbered space, but programs want structured collections. The earliest question in computing was: how do you lay a collection out in that flat space so the machine can find element i quickly, and so the hardware's caching machinery works with you instead of against you?",
    withoutIt:
      "You write code whose Big-O looks fine and whose wall-clock time is 50x worse than it should be, and you have no vocabulary to explain why. You load 2.9M rows into a dataframe on a laptop and get an out-of-memory kill with no mental model for what went wrong.",
    prereqs: [],
    unlocks: ["hash-tables", "trees-indexes"],
    level1: [
      "An array is a single contiguous block of memory holding equal-sized slots. Because every slot is the same width, the address of element i is just base_address + i * width — one multiply and one add, regardless of whether i is 3 or 3 million. That constant-time indexing is the entire reason arrays sit underneath almost every other data structure.",
      "The second reason arrays win is the memory hierarchy. Your CPU does not fetch one byte from RAM; it fetches a cache line, typically 64 bytes. Reading array element 0 drags elements 1 through 15 into fast cache for free. Walking an array is therefore mostly cache hits. Walking a linked list scattered across the heap is mostly cache misses, and a cache miss costs roughly 100x an L1 hit. Same Big-O, wildly different reality.",
      "The cost of contiguity is inflexibility. Inserting in the middle means shifting everything after it. Growing means allocating a bigger block and copying — Python lists and Go slices amortize this by doubling capacity, so appends are O(1) on average but occasionally pay a big copy. Every collection type you use is a different answer to this same trade: fast indexing versus cheap insertion.",
    ],
    level2: [
      {
        heading: "Row-major, column-major, and why analytics chose columns",
        body: "A 2D table has to be flattened into 1D memory somehow. Row-major stores row 0 entirely, then row 1 — good when you read whole records (an OLTP app fetching one customer). Column-major stores all of column 0, then column 1 — good when you scan one field across millions of records (SUM(quantity_sold) over 2.3M rows). This single layout choice is why Parquet, DuckDB, ClickHouse and pandas' internals are columnar: scanning one column touches only that column's bytes, and identical-typed values next to each other compress far better. Postgres is row-major heap storage, which is one honest reason a Postgres-based analytics stack has a ceiling that a columnar engine does not.",
      },
      {
        heading: "Where the memory actually goes",
        body: "A Python list of 2.9M integers is not 2.9M * 8 bytes. It is an array of 8-byte pointers, each pointing at a heap-allocated PyObject carrying a refcount, a type pointer, and the value — roughly 28 bytes each, plus allocator overhead, plus pointer-chasing on every access. A NumPy array of the same data is one flat 23MB block of raw int64. This ~4-6x difference in footprint, and the far bigger difference in scan speed, is the whole reason the scientific Python stack exists. When a pandas DataFrame blows up your RAM, the fix is almost never 'buy more RAM' — it is 'stop materializing objects you only wanted to aggregate'.",
      },
      {
        heading: "Amortized growth and the doubling trick",
        body: "Appending to a full array requires allocate-bigger + copy-everything, which is O(n). Doing that on every append gives O(n^2) total. Doubling capacity instead means the expensive copies happen at sizes 1, 2, 4, 8, 16... and the total copy work across n appends sums to under 2n — so each append is O(1) amortized. This is the first amortized-analysis argument most engineers meet, and the reason 'append in a loop' is fine in Python but 'insert at index 0 in a loop' is not.",
      },
    ],
    level3: [
      {
        heading: "Failure mode: the 2.9M-row OOM in this repo",
        body: "The ML baseline job pulled ~2.9M rows of product-day history into pandas to compute a weighted moving average. It died on an out-of-memory error. Big-O analysis said nothing useful — the algorithm was linear. The real story was memory layout: 2.9M rows x many columns, materialized as Python-managed objects, plus pandas' habit of copying on transformation, blew past available RAM. The fix was not chunking and not a bigger machine — it was pushing the aggregation into SQL so Postgres streamed and grouped server-side and returned ~392K already-aggregated rows. Lesson worth keeping: when data is large, move the computation to the data instead of moving the data to the computation.",
      },
      {
        heading: "Trade-offs you accept by defaulting to arrays",
        body: "Contiguity means allocation can fail even when total free memory is sufficient, because you need one unbroken block — fragmentation is a real production failure mode in long-lived processes. Doubling growth means your process can transiently hold ~1.5x the final size during a resize, so peak RSS exceeds steady-state RSS. And contiguous structures are hostile to concurrent mutation: a resize invalidates every pointer into the array, which is exactly why Rust's borrow checker refuses to let you hold a reference into a Vec while pushing to it. Linked structures avoid all three problems and lose on every access pattern that matters for analytics.",
      },
      {
        heading: "Interview framing",
        body: "The senior move is refusing to answer 'array vs linked list' with Big-O alone. Say: 'Asymptotically insertion is O(1) for a list and O(n) for an array, but for n under roughly ten thousand the array usually wins even for insertion, because memmove is a single cache-friendly streaming operation while list traversal is n dependent cache misses. I would pick based on measured access patterns, not the table in the textbook.' Then name a real incident — 'I hit an OOM loading 2.9M rows into pandas and fixed it by aggregating in SQL down to 392K rows' — because a specific number and a specific fix is what separates a memorized answer from an owned one.",
      },
    ],
    axonflux:
      "Directly, in three places. The ML baseline OOM (2.9M rows into pandas, fixed by aggregating in SQL to ~392K rows) is a memory-layout failure, not an algorithms failure. Ingestion in raw_ingestion/common/ingest_core.py inserts in 2000-row chunks specifically so peak memory stays bounded and independent of file size. And derived.product_daily_metrics is a deliberately dense ~2.3M-row (date x product) array — a fully materialized grid with no gaps, chosen because dense contiguous scans and window functions are far cheaper than sparse joins that must reconstruct missing days.",
    companies:
      "ClickHouse and DuckDB are essentially column-major array engines with vectorized execution — they beat row stores on analytics by 10-100x mostly through layout, not algorithms. Apache Arrow exists purely to standardize an in-memory columnar layout so systems can share data with zero deserialization. Every JVM shop eventually learns the same lesson as arrays-of-objects versus object-of-arrays.",
    whenNot:
      "Do not force arrays when you genuinely need cheap arbitrary insertion or stable references into the middle of a collection — an intrusive linked list or an arena with indices is the right call. Do not hand-optimize layout before profiling; for collections under a few thousand elements, clarity beats cache-friendliness every time and the difference is unmeasurable.",
    files: [
      { path: "raw_ingestion/common/ingest_core.py", note: "2000-row chunked insert — bounded peak memory regardless of file size" },
      { path: "sql/rebuild_derived/01_product_daily_metrics.sql", note: "dense date x product grid, ~2.3M rows, no gaps" },
      { path: "ml/train.py", note: "the ML path whose baseline job hit the 2.9M-row OOM" },
    ],
    interview: [
      {
        q: "Why is iterating an array often much faster than a linked list with the same number of elements?",
        a: "Cache lines. The CPU fetches 64 bytes at a time, so reading array element i also pulls the next ~15 elements into L1 for free, and the hardware prefetcher recognizes the linear stride and stays ahead of you. A linked list's nodes are scattered across the heap, so each hop is a potential cache miss at roughly 100x the cost of an L1 hit, and the prefetcher cannot guess the next address because it is stored in the data you have not loaded yet. Same O(n), radically different constants.",
      },
      {
        q: "Your job OOMs loading a few million rows into a dataframe. Walk me through it.",
        a: "First I separate footprint from algorithm — linear work does not cause OOM, materialization does. Then I ask what fraction of the data the computation actually needs. In my case the job was computing a weighted moving average per product, so it needed grouped aggregates, not raw rows. I pushed the GROUP BY into Postgres and pulled ~392K aggregated rows instead of 2.9M raw ones. If aggregation were not possible I would chunk and stream, or switch to a columnar format so only the needed columns are read. Buying RAM is the last option because it just moves the cliff.",
      },
      {
        q: "When would you choose column-major over row-major storage?",
        a: "When the read pattern is 'few columns, many rows' — analytics. Column-major lets you scan only the columns in the query, and adjacent same-typed values compress dramatically better. Row-major wins when you fetch whole records by key, which is the OLTP pattern. The honest caveat is that column stores make single-row updates expensive, so systems that need both usually run a row store for writes and replicate into a column store for reads.",
      },
    ],
    mentor: {
      deep: [
        "base + i * width, and why that makes indexing O(1)",
        "Cache lines and why locality dominates Big-O at small and medium n",
        "The difference between an array of pointers-to-objects and a flat array of values",
      ],
      abstract: [
        "Exact allocator internals (malloc bins, arenas)",
        "The precise growth factor your language uses",
        "SIMD vectorization details — know it exists, not how to write it",
      ],
      mistakes: [
        "Quoting Big-O without asking what the constants are on real hardware",
        "Assuming a Python list of ints costs 8 bytes per int",
        "Reaching for a bigger machine before asking whether the data needed to be in memory at all",
      ],
    },
    exercises: [
      "Time summing 10M ints in a Python list versus a NumPy array, and record both the ratio and the memory footprint of each.",
      "Write a benchmark inserting 100k elements at index 0 of a list versus appending — explain the shape of the curve you get.",
      "Take one heavy pandas step in ml/ and rewrite it as a SQL GROUP BY; measure rows transferred before and after.",
      "Read raw_ingestion/common/ingest_core.py and explain in writing why the chunk size bounds memory but not total work.",
    ],
    pos: { x: 5, y: 6 },
  },

  // ── 2. HASH TABLES ──────────────────────────────────────────────────
  {
    id: "hash-tables",
    title: "Hash Tables",
    domain: "cs",
    difficulty: "beginner",
    status: "ready",
    tagline: "turn a name into an address",
    analogy:
      "A cloakroom with a thousand numbered hooks and no attendant memory. You hand over a coat with your name on it; a fixed rule converts 'Manu Puranic' into hook 417, every single time. Retrieval never involves searching the rack — you recompute 417 and reach straight for it. The rule is the hash function, the hooks are the array, and the awkward moment when two names both compute to 417 is a collision.",
    problem:
      "Arrays give O(1) lookup only if you already know the numeric index. Real programs look things up by name, barcode, email, session token. Scanning to find a match is O(n), and sorting to binary-search costs O(log n) plus the burden of keeping order. The question: can you get array-speed lookup keyed by arbitrary values?",
    withoutIt:
      "Every lookup by name becomes a scan. Column mapping during ingestion becomes a chain of if-statements. Joins degrade to nested loops. Deduplication becomes O(n^2). Almost every 'this got slow as data grew' story is a missing hash table or a missing index.",
    prereqs: ["arrays-memory"],
    unlocks: ["graphs-dags", "dynamic-programming"],
    level1: [
      "A hash table is an array plus a function. The hash function converts a key of any type into an integer; that integer modulo the array size gives a slot. Insert writes there, lookup reads there. Both are O(1) on average because neither depends on how many items are already stored.",
      "Two different keys will eventually map to the same slot — this is not a bug to be eliminated but a certainty to be handled. Two standard strategies: chaining stores a small list per slot, and open addressing probes forward to the next free slot. Python's dict uses open addressing; Java's HashMap uses chaining that upgrades to a tree when a bucket gets pathological.",
      "The O(1) claim has a load-factor condition attached. As the table fills past roughly 70%, collisions rise sharply and probes get long, so implementations resize — allocate a bigger array and rehash everything. That resize is O(n), amortized away across many inserts, exactly like array doubling. Hash tables are fast on average, and occasionally have a bad day.",
    ],
    level2: [
      {
        heading: "What a good hash function has to do",
        body: "It must distribute keys uniformly across slots, be fast to compute, and be deterministic within a process run. Uniformity is the one people underestimate: if your keys are sequential barcodes and your hash is identity-mod-size, everything clumps into a few slots and you have rebuilt a linked list with extra steps. Note that cryptographic hashes and hash-table hashes are different tools with the same word. SHA-256 (used in this repo to fingerprint ingested files) is designed to be expensive and collision-resistant against an adversary. A dict's hash is designed to be cheap; the collision resistance it offers is statistical, not adversarial. Confusing the two produces either an unbearably slow dict or a trivially forgeable fingerprint.",
      },
      {
        heading: "Sets, dicts, dedup, and joins are all the same structure",
        body: "A set is a hash table without values. Deduplication is inserting into a set. A GROUP BY is a hash table from group key to running aggregate. A hash join builds a table from one relation's join key and probes it with the other's — that is how Postgres turns an O(n*m) nested loop into O(n+m). Once you see that these are one structure wearing four hats, a large fraction of both database internals and everyday code stops being mysterious.",
      },
      {
        heading: "Ordering, iteration, and the guarantees you do not get",
        body: "A hash table gives you point lookups and nothing else. No range queries, no min, no sorted iteration, no prefix search. Python dicts preserving insertion order since 3.7 is an implementation detail elevated to a guarantee, and it is insertion order, not key order. The moment you need 'all barcodes starting with 890' or 'everything between two dates', a hash table is the wrong structure and you want a tree.",
      },
    ],
    level3: [
      {
        heading: "Failure modes: adversarial collisions and resize pauses",
        body: "Hash flooding is a real attack: send requests whose keys all hash to one bucket, and an O(1) endpoint degrades to O(n) per request until the server falls over. The fix, adopted across Python, Ruby, and the JVM after the 2011 disclosures, is per-process hash randomization with a secret seed — which is precisely why PYTHONHASHSEED exists and why you must never persist a Python hash() value to disk or compare it across processes. The second failure mode is latency: a resize at 10M entries is one long stop-the-world rehash, so a p99 latency graph on a growing table shows periodic spikes. Incremental resizing (Redis rehashes a few buckets per operation) trades throughput for a flat tail.",
      },
      {
        heading: "Memory cost, and why trees still exist",
        body: "Hash tables deliberately waste space — you keep the table under ~70% full to preserve speed, so 30%+ of the allocation is empty slots, plus per-entry hash caches. They also destroy locality: consecutive keys land in unrelated slots, so iterating a large hash table is a cache-miss festival while iterating a sorted array is a streaming read. This is why a B-tree index can beat a hash index in a database even for equality lookups: the B-tree supports range scans, ordered output, and multi-column prefixes, and its extra log(n) hops are cheap because the upper levels stay cached. Postgres does have HASH indexes; they are rarely the right answer.",
      },
      {
        heading: "Interview framing",
        body: "Say the average case, then immediately volunteer the caveat, because volunteering caveats is the signal. 'Average O(1) for get, put, and delete, amortized over resizes. Worst case O(n) with adversarial or badly distributed keys — which is why runtimes randomize the seed per process, and why Java upgrades a degenerate bucket to a red-black tree for O(log n) worst case. I would not use a hash structure if I needed ordering or range queries; that is a B-tree.' If asked to design one, talk about load factor and growth policy before you talk about the hash function — that is where the real engineering lives.",
      },
    ],
    axonflux:
      "Used constantly, mostly invisibly. Every ingestion module in raw_ingestion/ is built around a HEADER_MAP dict mapping messy CSV column names to database column names — a hash table used as a translation layer, so adding a new export format is a data change rather than a code change. The Academy itself builds TOPIC_BY_ID via Object.fromEntries in web/lib/academy/topics.ts so topic lookups during graph traversal are O(1) instead of a scan per edge. The pipeline router keeps a live dict registry of run_id to subprocess handle so a cancel request can find and kill the right process. Postgres uses hash joins internally on the basket-analysis self-join over bill_no. And SHA-256 file hashing gates duplicate ingestion — the cryptographic cousin, used for identity rather than indexing.",
    companies:
      "Redis is, at its core, a hash table exposed over a network. Every language's object/dict/map type is one. Distributed systems generalize it: consistent hashing places keys onto nodes in Cassandra, DynamoDB, and every CDN's shard router, and Bloom filters give a probabilistic membership test that saves disk reads in Cassandra and BigTable.",
    whenNot:
      "Anything needing order: ranges, sorting, nearest-neighbour, prefix search, min/max. Tiny collections where a linear scan over an array is faster in practice because hashing has real per-lookup cost. Anywhere an attacker controls the keys and you have not confirmed the runtime randomizes its seed. And never persist a language-level hash value — it is not stable across processes or versions.",
    files: [
      { path: "raw_ingestion/sales_itemwise.py", note: "HEADER_MAP dict — CSV column names to DB columns" },
      { path: "raw_ingestion/common/header_normalizer.py", note: "normalizes messy headers before the map lookup" },
      { path: "web/lib/academy/topics.ts", note: "TOPIC_BY_ID via Object.fromEntries — O(1) node lookup during graph traversal" },
      { path: "api/routers/pipeline.py", note: "_active_procs dict — run_id to live subprocess, so cancel can find its target" },
      { path: "sql/rebuild_derived/10_product_associations.sql", note: "self-join on bill_no — Postgres executes this as a hash join" },
    ],
    interview: [
      {
        q: "Hash tables are O(1). When are they not?",
        a: "Three cases. Adversarial keys engineered to collide, which turns lookups into O(n) scans of one bucket — mitigated by per-process seed randomization and, in Java, by promoting a degenerate bucket to a tree. Load factor creep, where a table allowed past ~70% full spends its time probing. And the resize itself, which is O(n) and shows up as p99 latency spikes even though the amortized average stays O(1). Also worth saying: O(1) counts operations, not time — iterating a large hash table is slow in wall-clock terms because it has terrible cache locality.",
      },
      {
        q: "Why would a database use a B-tree index rather than a hash index for equality lookups?",
        a: "Because the B-tree gives you strictly more for a small constant cost. Range queries, ORDER BY without a sort, min and max in one descent, and multi-column prefix matching all fall out of the sorted structure. The extra log(n) descent is nearly free since the upper levels stay resident in cache. A hash index only wins on pure point lookups on a huge table, and even then the margin is small — which is why Postgres hash indexes are a niche tool rather than the default.",
      },
      {
        q: "Chaining or open addressing?",
        a: "Open addressing has better cache behaviour because everything lives in one contiguous array — no pointer chase per collision — and that is why Python's dict and most modern high-performance maps use it. It pays for that with sensitivity to load factor and with awkward deletion, since you must leave tombstones or you break probe chains. Chaining tolerates high load factors gracefully and deletes cleanly, which matters if your size is unpredictable. For a general-purpose map I would start with open addressing and Robin Hood probing.",
      },
    ],
    mentor: {
      deep: [
        "Load factor, and why it — not the hash function — drives real performance",
        "Why collisions are inevitable (pigeonhole) and how each strategy pays for them",
        "The difference between a cryptographic hash and a hash-table hash",
      ],
      abstract: [
        "The exact mixing function in SipHash or MurmurHash",
        "Robin Hood probing internals",
        "CPython's dict compaction layout",
      ],
      mistakes: [
        "Persisting or transmitting a language hash() value",
        "Using a mutable object as a key and then mutating it",
        "Assuming O(1) means fast — 10M scattered lookups are cache-miss bound",
        "Reaching for a dict when the access pattern is actually a range query",
      ],
    },
    exercises: [
      "Implement a hash table with open addressing and resize-at-70%; graph insert latency against size and find the resize spikes.",
      "Deliberately break your hash function to return a constant, and measure the degradation curve.",
      "Run EXPLAIN ANALYZE on sql/rebuild_derived/10_product_associations.sql and identify the hash join and its build side.",
      "Rewrite one HEADER_MAP lookup in raw_ingestion/ as an if/elif chain and argue, in writing, why the dict is the better design.",
    ],
    pos: { x: 14, y: 16 },
  },

  // ── 3. TREES & DATABASE INDEXES ─────────────────────────────────────
  {
    id: "trees-indexes",
    title: "Trees & Database Indexes",
    domain: "cs",
    difficulty: "intermediate",
    status: "ready",
    tagline: "sorted structure buys you range queries",
    analogy:
      "A library card catalogue with drawers inside drawers. The top drawer says A-F, G-M, N-S, T-Z. Open A-F and you find AA-AC, AD-AF, and so on. Four or five drawer-opens and you are holding one card out of ten million. Crucially, because the cards are in order, 'give me everything between Dickens and Dostoevsky' costs no more than finding Dickens and then reading forward. That last property — cheap ranges — is what a hash table can never give you, and it is why databases are built on trees.",
    problem:
      "Sorted arrays give you binary search but cost O(n) to insert. Linked lists give you cheap insertion but no search. Databases need both, at scale, on disk, where a single random read costs a million times a memory access. The B-tree is the answer engineered specifically for that disk-shaped world.",
    withoutIt:
      "Every query is a sequential scan. A dashboard filter over 2.3M rows takes seconds instead of milliseconds. You add machines to solve a problem that one CREATE INDEX would have solved, and you never learn why your queries were slow.",
    prereqs: ["arrays-memory"],
    unlocks: ["graphs-dags"],
    level1: [
      "A binary search tree keeps every left subtree smaller than its node and every right subtree larger, so searching means repeatedly halving the space: O(log n). The catch is that a plain BST built from already-sorted input degenerates into a linked list, so real implementations self-balance — red-black trees and AVL trees add rotation rules that keep the height logarithmic no matter the insertion order.",
      "Databases use a different shape: the B-tree, and its cousin the B+tree. Instead of two children per node it has hundreds, chosen so one node fills one disk page (8KB in Postgres). This makes the tree extremely shallow — a table of 100 million rows is typically 4 levels deep — which matters because the cost model on disk is 'number of pages touched', not 'number of comparisons'.",
      "An index is a separate on-disk B-tree mapping column values to row locations. Reads get dramatically faster; writes get slower, because every INSERT must also update every index on the table. That trade — read speed bought with write cost and disk space — is the single most important thing to understand about indexing.",
    ],
    level2: [
      {
        heading: "Why B-trees and not binary trees",
        body: "Height is the cost driver when nodes live on disk. A balanced binary tree over 100M rows is about 27 levels deep, so a lookup is up to 27 potentially random I/Os. A B-tree with a fanout of ~500 keys per 8KB page reaches the same 100M rows in 4 levels, and the top two levels are almost always cached, so a cold lookup is 1-2 real reads. The B+tree variant stores values only in leaves and links leaves in a list, so a range scan descends once and then walks sideways sequentially — which is why 'WHERE date BETWEEN' is fast and why an index can satisfy ORDER BY without a sort step.",
      },
      {
        heading: "The rules that decide whether your index is used",
        body: "A multi-column index on (barcode, date) is a phone book sorted by surname then first name: it serves 'barcode = X', 'barcode = X AND date > Y', and 'ORDER BY barcode, date' — but not 'date > Y' alone, because you cannot binary-search first names in a book sorted by surname. This is the leftmost-prefix rule. Two more that bite in practice: wrapping the indexed column in a function (WHERE DATE(bill_datetime) = ...) makes the index unusable unless you built a matching expression index, and low-cardinality columns are often not worth indexing at all because the planner will correctly prefer a sequential scan when it expects to touch a large fraction of the table.",
      },
      {
        heading: "The planner is the thing you are actually negotiating with",
        body: "You do not choose the index; the query planner does, using table statistics gathered by ANALYZE. It estimates how many rows each path returns and picks the cheapest plan. This means an index can exist and be ignored — usually because statistics are stale, because your predicate is not sargable, or because the planner correctly judges a scan cheaper. EXPLAIN ANALYZE is the only honest way to know, because it shows estimated rows next to actual rows, and a large gap between those two numbers is the single most useful diagnostic signal in database performance work.",
      },
    ],
    level3: [
      {
        heading: "The VIEW-to-TABLE result in this repo",
        body: "derived.product_dimension was a VIEW built over several heavy CTEs. Every dashboard query that touched it re-executed that entire CTE stack from scratch — roughly 700ms per call — because a Postgres VIEW is macro substitution, not storage: there is nothing to index and nothing cached. Converting it to a real TABLE built once per pipeline run dropped it to about 55ms, a ~12x win. The reason this was nearly free is architectural rather than clever: derived.* is truncated and rebuilt every run anyway, so materialization costs nothing extra and buys you a physical table that can carry indexes and statistics. The general principle: a VIEW is a saved query; if the query is expensive and the freshness requirement is 'once per pipeline run', materialize it.",
      },
      {
        heading: "What indexes cost, and index-only scans",
        body: "Every index is a second B-tree that must be kept in sync, so a table with six indexes turns one INSERT into seven writes and inflates WAL volume proportionally. Indexes also fragment and bloat under heavy update load, which is what REINDEX CONCURRENTLY exists to fix. On the win side, a covering index — one that includes every column the query needs, via INCLUDE in Postgres — enables an index-only scan that never touches the heap at all, often a 5-10x improvement. The Postgres-specific wrinkle is that index-only scans still consult the visibility map, so they only stay index-only if the table is reasonably well vacuumed. Rules of thumb: index your foreign keys and your common filter and sort columns, and treat every additional index as a permanent write-path tax you must justify.",
      },
      {
        heading: "Interview framing",
        body: "Anchor on the disk cost model, because that is the insight most candidates miss: 'B-trees exist because the unit of cost is a page read, not a comparison. High fanout means a shallow tree means few I/Os.' Then show you know indexes are not free: 'Every index is a write amplifier and consumes cache that the heap wanted.' Then bring a concrete result — 'I had a heavy-CTE view at 700ms per call; because my derived layer is rebuilt every run anyway, materializing it as a table cost nothing and took it to 55ms.' Naming the architectural precondition that made the fix cheap is what makes that story senior rather than lucky.",
      },
    ],
    axonflux:
      "Postgres B-tree indexes carry the whole read path over the derived layer — the dense (date x product) grid in derived.product_daily_metrics is ~2.3M rows, and dashboard filters by barcode and date range are only viable because of them. The most instructive result in this repo is the product_dimension VIEW-to-TABLE conversion in sql/rebuild_derived/05_necessary_views.sql: ~700ms down to ~55ms, roughly 12x, with no query rewriting at all. The lesson is recorded as a project rule — heavy-CTE objects must be TABLEs, not VIEWs, because the pipeline rebuild makes materialization free. B-trees also silently enforce every PRIMARY KEY and UNIQUE constraint in sql/raw_tables.sql.",
    companies:
      "Every relational database ships B+trees as the default index. MySQL InnoDB goes further with clustered indexes, where the primary key IS the physical row order — which is why random UUID primary keys cause painful page splits there and why sequential IDs are preferred. Write-heavy systems (Cassandra, RocksDB, LevelDB) swap the B-tree for an LSM tree, trading read amplification for far better write throughput.",
    whenNot:
      "Do not index a small table — a sequential scan of a few thousand rows beats a tree descent, and the planner knows it. Do not index low-cardinality columns like a boolean flag unless the distribution is heavily skewed and you are querying the rare value. Do not index a write-heavy staging table you only ever bulk-scan. And do not use a B-tree for full-text search, geospatial, or vector similarity — those need GIN, GiST, and HNSW respectively.",
    files: [
      { path: "sql/rebuild_derived/05_necessary_views.sql", note: "product_dimension — the VIEW to TABLE conversion, ~700ms to ~55ms" },
      { path: "sql/rebuild_derived/01_product_daily_metrics.sql", note: "~2.3M row dense grid — the table indexes have to serve" },
      { path: "sql/raw_tables.sql", note: "primary keys and unique constraints, each silently a B-tree" },
      { path: "scripts/setup_raw_triggers.py", note: "dedup triggers that rely on unique indexes to do their work" },
    ],
    interview: [
      {
        q: "Why do databases use B-trees instead of binary search trees?",
        a: "Because the cost unit is a disk page, not a comparison. A binary tree over 100M rows is ~27 levels, so up to 27 random I/Os. A B-tree sized so each node fills an 8KB page has a fanout of several hundred, reaching the same data in about 4 levels, with the top levels almost always cached — so a cold lookup is 1-2 real reads. B+trees additionally keep all values in linked leaves, which makes range scans and ORDER BY nearly free after the initial descent.",
      },
      {
        q: "You added an index and the query is still slow. What now?",
        a: "EXPLAIN ANALYZE first, and specifically compare estimated rows to actual rows. A large gap means stale statistics, so ANALYZE the table. If the index is simply not used, I check whether the predicate is sargable — a function wrapped around the column kills it unless there is a matching expression index — and whether the leftmost-prefix rule is satisfied for a composite index. If it is used but still slow, the cost is usually heap fetches, and the fix is a covering index with INCLUDE so it becomes an index-only scan. And sometimes the planner is right and a sequential scan genuinely is cheaper.",
      },
      {
        q: "When would you materialize a view instead of leaving it as a view?",
        a: "When the query is expensive and the freshness requirement is looser than per-request. A view is macro substitution — it re-executes fully on every reference and cannot be indexed. I had a dimension view built over heavy CTEs costing about 700ms per dashboard call; materializing it as a table took it to about 55ms. What made that decision easy rather than risky was that my derived schema is truncated and rebuilt on every pipeline run, so the table is refreshed as a side effect and staleness is bounded by the pipeline cadence. Without that guarantee I would need REFRESH MATERIALIZED VIEW CONCURRENTLY and an explicit staleness budget.",
      },
    ],
    mentor: {
      deep: [
        "Why fanout drives tree height and height drives I/O count",
        "Leftmost-prefix rule for composite indexes",
        "Reading EXPLAIN ANALYZE, especially estimated versus actual rows",
        "The read/write trade every index makes",
      ],
      abstract: [
        "Red-black rotation cases",
        "Page-split algorithms",
        "Postgres visibility map internals",
      ],
      mistakes: [
        "Indexing every column 'to be safe' and quietly tripling write cost",
        "Wrapping an indexed column in a function and wondering why the index is skipped",
        "Trusting EXPLAIN without ANALYZE — estimates are not measurements",
        "Leaving an expensive multi-CTE object as a VIEW",
      ],
    },
    exercises: [
      "EXPLAIN ANALYZE a dashboard query against derived.product_daily_metrics before and after adding an index on (barcode, date); record both plans.",
      "Build a composite index and empirically demonstrate the leftmost-prefix rule by querying the second column alone.",
      "Convert one remaining heavy VIEW in sql/rebuild_derived/ to a TABLE and measure the difference the way product_dimension was measured.",
      "Insert 1M rows into a table with zero indexes, then with five, and quantify the write-path tax.",
    ],
    pos: { x: 5, y: 26 },
  },

  // ── 4. GRAPHS & DAGs ────────────────────────────────────────────────
  {
    id: "graphs-dags",
    title: "Graphs & DAGs",
    domain: "cs",
    difficulty: "intermediate",
    status: "ready",
    tagline: "dependencies are edges, order is a sort",
    analogy:
      "A recipe with prerequisites. You cannot ice the cake before baking it, and you cannot bake before mixing — but you can chop nuts at any point, because nothing depends on it. Write each step as a node and each 'must happen first' as an arrow, and you have a directed acyclic graph. Finding a legal cooking order is a topological sort. Discovering that step A requires step B which requires step A means you have a cycle, and there is no legal order at all.",
    problem:
      "Some relationships are not hierarchies and not lists. Dependencies between build steps, prerequisites between concepts, which products appear in the same basket, which barcodes are secretly the same product. Trees cannot express these because a node may have many parents, and cycles may exist. Graphs are the general structure; DAGs are the well-behaved subset where 'do things in order' is even possible.",
    withoutIt:
      "You hand-maintain execution order and it silently rots as steps are added. You cannot detect a circular dependency until it deadlocks in production. Transitive relationships — 'A is the same product as B, B is the same as C' — require ad-hoc code that gets the closure wrong.",
    prereqs: ["hash-tables", "trees-indexes"],
    unlocks: ["dynamic-programming", "concurrency"],
    level1: [
      "A graph is nodes plus edges. Edges can be directed (a prerequisite points forward) or undirected (two products co-occur in a basket, symmetrically). Two representations dominate: an adjacency list, which is a hash map from node to its neighbours and is right for sparse graphs, and an adjacency matrix, which is an n-by-n array and is right only when the graph is dense.",
      "A DAG is a directed graph with no cycles. That single restriction unlocks a lot: you can topologically sort it (produce an order where every node comes after all its prerequisites), you can compute over it in one pass without infinite loops, and you can safely parallelize any two nodes that do not depend on each other. Build systems, task schedulers, dbt models, Airflow, git history, and this Academy's prerequisite map are all DAGs for exactly these reasons.",
      "Two traversals carry most of the weight. BFS explores level by level using a queue and finds shortest paths in unweighted graphs. DFS goes deep using a stack or recursion and is the natural tool for cycle detection and connected components. Almost every graph algorithm you will meet is one of these two with extra bookkeeping.",
    ],
    level2: [
      {
        heading: "Topological sort, and the layered variant this repo uses",
        body: "Kahn's algorithm repeatedly emits nodes with zero remaining incoming edges and removes their edges, giving a linear order in O(V+E). A layered variant emits all zero-indegree nodes together as one level, then the next set, and so on — which is strictly more useful when you want parallelism, because everything in one layer is independent by construction and can run concurrently. The Academy's topologicalLayers() in web/lib/academy/topics.ts is exactly this: layer 0 is topics with no prerequisites, and each layer depends only on earlier ones. It also does something worth copying — it bounds its iterations and, if a layer comes back empty, it stops and surfaces the remaining nodes rather than looping forever. That is cycle detection built into the traversal, chosen deliberately because the input is hand-authored data where a typo can create a cycle.",
      },
      {
        heading: "Union-Find and transitive grouping",
        body: "When the question is 'which of these things are connected, directly or indirectly', the right tool is a disjoint-set (Union-Find) structure rather than repeated traversal. Each element starts as its own set; union merges two sets; find returns a set's representative. With path compression and union by rank, both are effectively O(1) amortized (technically inverse-Ackermann, a function that is under 5 for any input you will ever have). The killer property is transitivity for free: union(A,B) and union(B,C) automatically puts A, B and C in one group without you ever computing the closure yourself. This repo's entity-resolution clustering uses precisely this — RapidFuzz produces pairwise similarity edges, Union-Find turns those edges into connected components, and each component becomes a candidate group of barcodes that are secretly the same product.",
      },
      {
        heading: "Weighted graphs and co-occurrence",
        body: "Add a number to each edge and new questions become askable. Dijkstra finds shortest weighted paths; minimum spanning trees find the cheapest connecting structure. In retail, the useful weighted graph is co-occurrence: products are nodes, and an edge weight is how often two products appear on the same bill. derived.product_associations is that graph — about 30,018 pairs above a minimum-5-co-occurrence threshold, with support, confidence and lift as edge attributes. Note that lift is a directed asymmetry measure computed over an undirected co-occurrence edge, which is why confidence is stored in both directions: bread implying butter is a different statement from butter implying bread.",
      },
    ],
    level3: [
      {
        heading: "Cycles: detect them, and decide what to do",
        body: "Cycle detection in a directed graph is DFS with three colours — white unvisited, grey on the current recursion stack, black finished — and an edge into a grey node is a back edge, hence a cycle. The engineering question is what you do next. Crashing is honest but hostile in a hand-authored dataset. The Academy's traversal degrades gracefully: it detects the stall, stops, and appends whatever is left so the UI still renders and the bad data is visible rather than fatal. Build systems make the opposite choice and hard-fail, because executing a partial order in a build is worse than not building. Both are defensible; what is not defensible is looping forever, which is what a naive while-loop over remaining nodes does.",
      },
      {
        heading: "Scale limits and where graph work goes wrong",
        body: "Adjacency matrices are O(V^2) memory, so a 30k-node product graph as a matrix is 900M cells — untenable, while the adjacency-list form at 30,018 edges is trivial. Recursive DFS blows the stack on deep graphs, so anything unbounded should be iterative with an explicit stack. The subtler trap is that graph traversal is pointer-chasing, which means terrible cache locality — this is why large-scale graph processing frameworks reorganize into edge-list arrays and process in vertex order rather than following pointers. And in SQL, transitive relationships need WITH RECURSIVE, which is easy to write without a termination guard and easy to accidentally make exponential.",
      },
      {
        heading: "Interview framing",
        body: "The strongest thing you can say here is that you shipped one. 'The Academy's prerequisite map is a DAG, and I wrote a layered topological sort over it — layer 0 has no prerequisites, each subsequent layer depends only on earlier ones, so it doubles as the recommended learning path. I chose the layered variant over plain Kahn because layers express which items are independent, and I made it degrade rather than crash on a cycle because the input is hand-authored content, not machine-generated.' Separately, name Union-Find for transitive grouping and explain why it beats repeated BFS: near-constant amortized union and find, transitivity for free, and no risk of recomputing components as new edges arrive.",
      },
    ],
    axonflux:
      "Three genuine graph uses, all live. First, this very file's neighbourhood: web/lib/academy/topics.ts builds an edge list from prerequisite arrays and runs topologicalLayers(), a layered Kahn-style topological sort with a bounded-iteration cycle guard — the learning path you are reading was produced by a graph algorithm. Second, scripts/cluster_product_names.py runs Union-Find over RapidFuzz similarity pairs to find connected components of barcodes that name the same physical product; that is the core of B3 entity resolution. Third, sql/rebuild_derived/10_product_associations.sql builds a weighted co-occurrence graph of ~30,018 product pairs with support, confidence and lift — the basis of 'frequently bought together'. The pipeline's 11 ordered SQL steps are a DAG too, though an implicitly-ordered one: the dependency is encoded in filename numbering rather than declared, which is a real simplification worth naming out loud.",
    companies:
      "Airflow, Dagster and dbt are topological sort with a UI attached — dbt infers its DAG from ref() calls in SQL and parallelizes independent models. Git's commit history is a DAG, and merge-base is lowest-common-ancestor. Every build system (Bazel, Make, Turborepo) is dependency-graph scheduling. Social and recommendation systems run graph algorithms at billion-edge scale; PageRank is eigenvector centrality on the web graph.",
    whenNot:
      "Do not model as a graph what is genuinely a tree or a list — you pay in complexity and gain nothing. Do not build a graph database for a handful of joins a relational database handles fine; the crossover is when queries are variable-depth traversals, not fixed joins. And do not implement your own scheduler when your DAG has eleven ordered steps and one machine: this repo's numbered SQL files are the right amount of machinery for its scale, and that restraint is a decision, not an oversight.",
    files: [
      { path: "web/lib/academy/topics.ts", note: "topologicalLayers() — layered topological sort with a cycle guard, over the prerequisite DAG" },
      { path: "scripts/cluster_product_names.py", note: "Union-Find over fuzzy-match pairs — connected components of duplicate products" },
      { path: "sql/rebuild_derived/10_product_associations.sql", note: "weighted co-occurrence graph, ~30,018 product pairs" },
      { path: "pipelines/weekly_pipeline.py", note: "an implicit DAG — step order encoded in filename numbering, not declared" },
    ],
    interview: [
      {
        q: "Explain topological sort and give me a real use.",
        a: "It produces a linear order of a DAG where every node follows all its prerequisites, in O(V+E) via Kahn's algorithm — repeatedly emit zero-indegree nodes and remove their edges. I use it in my own project: the Academy's topic map is a prerequisite DAG, and topologicalLayers() emits whole layers at a time rather than a flat order. The layered form is more useful because everything within a layer is provably independent, which is what you need if you want to parallelize — or, in my case, to tell a learner which topics they can pick up in any order right now. If a layer comes back empty there is a cycle, so cycle detection is a free side effect.",
      },
      {
        q: "You need to group records that are transitively equivalent — A matches B, B matches C. How?",
        a: "Union-Find. Each record starts as its own set, each similarity pair triggers a union, and connected components fall out at the end. With path compression and union by rank both operations are effectively constant amortized, and transitivity is automatic — I never compute the closure myself. That is exactly how the product entity resolution works here: fuzzy matching emits pairs above a similarity threshold, Union-Find turns pairs into clusters. The thing to be careful about is that transitivity is aggressive — a single bad edge merges two otherwise-unrelated clusters, which is why I run at a similarity threshold of 78 rather than the lower default; below that, false-positive edges chain unrelated products together.",
      },
      {
        q: "Adjacency list or adjacency matrix?",
        a: "List for sparse graphs, matrix for dense. The decision rule is edge count against V^2 — my product co-occurrence graph has about 30k nodes and 30k edges, so a matrix would be 900M cells of almost entirely zeros while the list is trivial. Matrices earn their keep when you need O(1) edge-existence checks or you are doing linear-algebra formulations like matrix-multiplication reachability, and those cases are rarer than textbooks imply.",
      },
    ],
    mentor: {
      deep: [
        "Why acyclicity is what makes ordering possible at all",
        "Kahn's algorithm and the layered variant",
        "Union-Find with path compression, and why transitivity is both the feature and the danger",
        "BFS versus DFS and which problems each is natural for",
      ],
      abstract: [
        "Tarjan's strongly-connected-components algorithm",
        "Dijkstra's priority-queue implementation details",
        "Graph database query planners",
      ],
      mistakes: [
        "Writing a dependency resolver with no cycle guard — it hangs instead of failing",
        "Using an adjacency matrix for a sparse graph",
        "Recursive DFS on untrusted-depth input and hitting stack overflow",
        "Assuming a fuzzy-match graph's components are clean — one bad edge merges two clusters",
      ],
    },
    exercises: [
      "Add a deliberate prerequisite cycle to a local copy of the topics data and observe exactly how topologicalLayers() degrades.",
      "Rewrite topologicalLayers() as a flat Kahn sort and write down what the UI loses.",
      "Implement Union-Find with and without path compression; measure on 100k unions.",
      "Query derived.product_associations for the highest-lift pairs and sanity-check three of them against real shopping intuition.",
    ],
    pos: { x: 14, y: 36 },
  },

  // ── 5. DYNAMIC PROGRAMMING ──────────────────────────────────────────
  {
    id: "dynamic-programming",
    title: "Dynamic Programming",
    domain: "cs",
    difficulty: "advanced",
    status: "ready",
    tagline: "never solve the same subproblem twice",
    analogy:
      "Climbing a staircase where you may take one or two steps, and someone asks how many distinct ways there are to reach step 40. Naively you explore every path and there are billions. But the number of ways to reach step 40 is simply the ways to reach 39 plus the ways to reach 38 — and once you have written that number down, you never recompute it. Forty scribbles on paper replace a billion-branch search. Dynamic programming is that scribbled sheet, formalized.",
    problem:
      "Recursive formulations of optimization problems tend to re-solve identical subproblems exponentially many times. Naive Fibonacci recomputes fib(30) millions of times. The realization — that a problem with optimal substructure and overlapping subproblems only needs each subproblem solved once — collapses exponential time to polynomial.",
    withoutIt:
      "Whole classes of problems look intractable when they are actually linear. You either write exponential code that works only on toy inputs, or you reach for an approximation you did not need. And you cannot recognize when a problem you are facing is secretly one you have seen before.",
    prereqs: ["hash-tables", "graphs-dags"],
    unlocks: ["greedy-algorithms"],
    level1: [
      "Dynamic programming applies when two conditions hold together. Optimal substructure: the best solution to the whole is built from best solutions to parts. Overlapping subproblems: the same parts recur many times. If only the first holds, you probably want divide-and-conquer or a greedy algorithm. If only the second holds, you probably want plain memoization or caching. Both together is DP.",
      "There are two implementation styles for the same idea. Top-down memoization keeps the natural recursion and adds a cache — usually a hash table keyed by the subproblem's parameters — so each distinct call computes once. Bottom-up tabulation drops recursion entirely and fills a table in dependency order, from base cases outward. Top-down is easier to derive from the recurrence; bottom-up avoids stack depth and is usually faster.",
      "The real skill is not the code, which is short. It is defining the state: what exactly does dp[i][j] mean, and what is the recurrence relating it to smaller states. If you can state those two sentences precisely, the implementation is nearly mechanical. If you cannot, no amount of coding will save you.",
    ],
    level2: [
      {
        heading: "The state-and-recurrence discipline",
        body: "Work in a fixed order. One: define the state in a sentence — 'dp[i] is the maximum profit obtainable considering only the first i items'. Two: write the recurrence — for each state, enumerate the last decision that could have produced it, and take the best. Three: write the base cases. Four: pick a fill order such that every state's dependencies are computed before it — which is exactly a topological order over the implicit DAG of subproblems, and is the reason DP sits downstream of graphs. Five, and only then, decide top-down or bottom-up. Skipping straight to code is why most people find DP hard; the difficulty is in step one, not step five.",
      },
      {
        heading: "The family of problems worth recognizing",
        body: "Most DP interview problems are variations on a small set. Knapsack — choose a subset under a capacity constraint. Longest common subsequence and edit distance — align two sequences, which is the same machinery Levenshtein distance and diff tools use, and the same machinery behind fuzzy string matching. Longest increasing subsequence. Coin change. Matrix chain multiplication. Interval scheduling with weights. Learning to say 'this is knapsack with an extra dimension' is worth more than memorizing twenty solutions, because the recurrence follows from the classification.",
      },
      {
        heading: "Space optimization and reconstruction",
        body: "If dp[i] depends only on dp[i-1], you do not need the whole table — two rolling rows suffice, taking a 2D O(n*m) table down to O(m) space. That is how edit distance runs on long strings. The catch is that you lose the ability to reconstruct the actual answer, only its value, because reconstruction walks backwards through the table. So the real trade is space against explainability of the result: keep the full table when the user needs to see which items were chosen, roll the rows when only the number matters.",
      },
    ],
    level3: [
      {
        heading: "When DP is the wrong reach",
        body: "DP's state space is the cost. Knapsack is famously 'pseudo-polynomial' — O(n*W) is linear in the capacity W's value, not its bit length, so a capacity of 10^9 makes the table impossible even though the input is tiny. High-dimensional states explode combinatorially. And DP requires a discrete, well-ordered decomposition; continuous optimization wants gradient methods instead. In practice, an approximation or a greedy heuristic with a proven bound often beats an exact DP that cannot fit in memory. Knowing that a problem is NP-hard and that your DP is exponential in a hidden parameter is more valuable than writing the DP.",
      },
      {
        heading: "Where DP hides in systems you already use",
        body: "You interact with DP constantly without writing it. The Viterbi algorithm decoding hidden Markov models is DP. Sequence alignment in bioinformatics is DP. Query optimizers use DP over join orders — Selinger's classic algorithm enumerates join subsets bottom-up precisely because the same sub-join costs recur. CTC decoding in speech models, and beam search's exact cousin, are DP. And every fuzzy string matcher — including the RapidFuzz library this repo uses for product-name clustering — computes edit distance internally, which is textbook DP. That last one is the closest DP gets to this codebase, and it is worth being precise: the DP is inside the library, not in code anyone here wrote.",
      },
      {
        heading: "Interview framing",
        body: "Never start coding. Say the four sentences: state definition, recurrence, base case, fill order. Then state complexity in both time and space, then offer the space optimization and name what it costs you (reconstruction). If you are stuck, say out loud 'let me check for optimal substructure and overlapping subproblems' — because if either is absent you should be arguing for greedy or divide-and-conquer instead, and recognizing that is itself the right answer sometimes. Also be ready to be honest about production relevance: most backend engineers write DP rarely, and saying 'I would reach for a library or a solver before hand-rolling a DP in production code' is a mature answer, not a weak one.",
      },
    ],
    axonflux:
      "Not used in AxonFlux, and it would be dishonest to claim otherwise — this is interview and fundamentals territory. There is no optimization problem in this codebase with overlapping subproblems that anyone solved with a memoized recurrence. Two things come close enough to be worth naming precisely, and neither is DP. First, derived.product_stock_position computes cumulative pseudo-stock with SQL window functions — a running sum is state[i] = state[i-1] + delta[i], the same recurrence shape as a one-dimensional DP, but there is no optimization and no choice being made at each step, so calling it DP would be stretching the word past usefulness. Second, RapidFuzz in scripts/cluster_product_names.py computes edit distance to score product-name similarity, and edit distance genuinely is DP — but the DP lives inside the library's C++ internals, not in code written here. If DP ever arrives in this project, the plausible entry point is procurement optimization: choosing which products to order under a budget constraint is knapsack, and that is currently solved by simple ranking instead.",
    companies:
      "Query optimizers in Postgres, Oracle and Spark use DP for join-order enumeration. Bioinformatics runs Smith-Waterman and Needleman-Wunsch at enormous scale. Speech and NLP systems use Viterbi and CTC decoding. Logistics and airline crew scheduling use DP inside larger integer-programming solvers. Financial option pricing on binomial lattices is DP. Most product engineers, honestly, encounter it mainly in interviews and in library internals.",
    whenNot:
      "When a greedy choice is provably optimal — DP is strictly more machinery for the same answer. When the state space does not fit in memory, which happens fast in real-world sizes. When the problem is continuous rather than discrete. When a well-tested solver or library already implements it, because a hand-rolled DP in production code is a maintenance liability that few teammates will be able to modify safely.",
    files: [],
    interview: [
      {
        q: "How do you recognize that a problem is a dynamic programming problem?",
        a: "I test two properties. Optimal substructure — can I express the best solution in terms of best solutions to smaller instances? And overlapping subproblems — does a naive recursion revisit the same instance repeatedly? Both must hold. If only substructure holds, it is divide-and-conquer or possibly greedy. If only overlap holds, plain memoization or caching is enough and there is no optimization structure to exploit. Once I believe both hold, I write the state definition and recurrence in English before any code, because that is where the actual difficulty lives.",
      },
      {
        q: "Top-down memoization or bottom-up tabulation?",
        a: "Top-down when the recurrence is natural and the reachable state space is sparse — you only compute states you actually need, and the code reads like the mathematical definition. Bottom-up when you need to avoid recursion depth, when you want the constant-factor speed of a tight array loop, or when you want to apply the rolling-row space optimization, which is awkward top-down. In an interview I usually derive top-down because it is easier to get right under pressure, then say how I would convert it, and mention that conversion means choosing a fill order that respects the subproblem dependency DAG.",
      },
      {
        q: "You optimized to O(m) space with rolling rows. What did that cost you?",
        a: "The ability to reconstruct the solution. Reconstruction walks backwards through the completed table to recover which decisions produced the optimum, and once you have discarded all but two rows there is nothing to walk. So the trade is: keep the full O(n*m) table if the user needs to see the chosen items, roll the rows if only the optimal value matters. There is a middle path — Hirschberg's algorithm recovers the alignment in linear space at the cost of roughly doubling the time — which is the right answer when both constraints genuinely bind.",
      },
    ],
    mentor: {
      deep: [
        "Defining state precisely, in one English sentence, before writing code",
        "Optimal substructure and overlapping subproblems as a test, not a slogan",
        "Why fill order is a topological order over the subproblem DAG",
      ],
      abstract: [
        "Specific solutions to the classic catalogue — derive them, do not memorize them",
        "Hirschberg's linear-space alignment",
        "Bitmask DP tricks",
      ],
      mistakes: [
        "Writing the loop before defining the state",
        "Memoizing on an incomplete key, so distinct subproblems collide",
        "Believing pseudo-polynomial means polynomial",
        "Forcing DP onto a problem where a greedy rule is provably optimal",
      ],
    },
    exercises: [
      "Implement Fibonacci naively, memoized, and tabulated; measure all three at n=40 and explain the gap in one paragraph.",
      "Implement edit distance with the full table, then with rolling rows, and confirm you can no longer reconstruct the alignment.",
      "Write the knapsack recurrence for the real procurement question — maximum expected sales value under a purchase budget, using data from derived.supplier_restock_recommendations — and then argue honestly whether it beats the current ranking heuristic.",
      "Take any DP solution you have written and produce the four-sentence explanation (state, recurrence, base case, fill order) from memory a day later.",
    ],
    pos: { x: 5, y: 46 },
  },

  // ── 6. GREEDY ALGORITHMS ────────────────────────────────────────────
  {
    id: "greedy-algorithms",
    title: "Greedy Algorithms",
    domain: "cs",
    difficulty: "intermediate",
    status: "ready",
    tagline: "take the best local move, prove it is safe",
    analogy:
      "Making change with coins. Asked for 87 rupees, you reach for the largest coin that fits, then repeat. No lookahead, no backtracking, and with Indian or US denominations you provably get the fewest coins. Now change the denominations to 1, 3 and 4 and ask for 6: greedy takes 4, then 1, then 1 — three coins — while the optimum is 3 and 3, two coins. Same algorithm, same intuition, and it is now wrong. Greedy is not a technique so much as a claim requiring proof.",
    problem:
      "Dynamic programming explores all decompositions and pays for it in time and memory. For some problems the extra search is provably unnecessary because a local rule never has to be revisited. Identifying those problems — and proving the rule is safe — turns exponential or polynomial work into a sort plus a single pass.",
    withoutIt:
      "You over-engineer problems that a sort and one loop would solve. Or worse, you use a greedy heuristic that happens to work on your test data, ship it, and discover its failure case in production with no idea why it broke.",
    prereqs: ["dynamic-programming"],
    unlocks: [],
    level1: [
      "A greedy algorithm builds a solution by repeatedly taking whatever looks best right now and never reconsidering. Because there is no backtracking, the cost is usually just the cost of sorting — O(n log n) — followed by a linear pass. When greedy is correct, it is dramatically simpler and faster than DP over the same problem.",
      "Correctness is the entire subject. Two properties must hold: the greedy-choice property, meaning a globally optimal solution can always be built starting from the locally optimal choice, and optimal substructure, meaning what remains after that choice is a smaller instance of the same problem. Standard proof techniques are exchange arguments — show any optimal solution can be transformed into the greedy one without getting worse — and 'greedy stays ahead' induction.",
      "The trap is that greedy always produces an answer, and the answer usually looks reasonable. Nothing crashes when greedy is wrong; you simply get a suboptimal result that no test catches. This is why 'is it greedy or DP' is one of the most common interview discriminators: it tests whether you reason about correctness or pattern-match on shape.",
    ],
    level2: [
      {
        heading: "The classics, and what makes each one safe",
        body: "Interval scheduling — to fit the most non-overlapping meetings, sort by earliest finish time and take greedily; the exchange argument is that swapping any optimal solution's first meeting for the earliest-finishing one never reduces the count. Huffman coding — repeatedly merge the two lowest-frequency symbols; this produces provably optimal prefix codes and is inside gzip and JPEG. Kruskal's minimum spanning tree — sort edges by weight, add each edge unless it forms a cycle, and detect the cycle with Union-Find, which is why greedy and disjoint-set structures show up together so often. Dijkstra is greedy too, and its correctness depends on non-negative weights, which is exactly why it breaks on negative edges and Bellman-Ford exists.",
      },
      {
        heading: "Greedy as approximation when exactness is out of reach",
        body: "When a problem is NP-hard, greedy stops being a shortcut to the optimum and becomes a principled approximation with a bound. Greedy set cover is within a ln(n) factor of optimal, and that bound is tight. Fractional knapsack is exactly solved by greedy on value-density, while 0/1 knapsack is not — the difference being whether you may take part of an item. Knowing the approximation ratio is what separates 'I used a heuristic' from 'I used a greedy 2-approximation with a proof', and interviewers notice the difference.",
      },
      {
        heading: "Heuristics that look greedy but are not greedy algorithms",
        body: "This distinction matters more in real work than the textbook cases. A ranking heuristic — 'sort by urgency and act on the top ones' — has the same shape as a greedy algorithm but makes no optimality claim and has no proof. That is fine, and it is usually the right engineering call; the failure is calling it a greedy algorithm and implying guarantees you have not established. Be precise: a greedy algorithm comes with an exchange argument or an approximation bound; a greedy heuristic comes with 'it worked well enough and here is how I would detect it not working'.",
      },
    ],
    level3: [
      {
        heading: "Failure modes, and how they hide",
        body: "Greedy failures are silent. Coin change with denominations 1, 3, 4 gives 4+1+1 instead of 3+3 and no exception is raised. Greedy graph colouring gives a valid but non-minimal colouring. In production, a greedy scheduler can starve low-priority work indefinitely because 'best right now' never selects it. The defence is not more testing of the happy path; it is (a) knowing the proof or knowing you do not have one, and (b) instrumenting the gap — periodically compute the exact or bounded answer offline on a sample and measure how far the greedy result drifts. A heuristic with a measured drift is an engineering decision. A heuristic with an unmeasured drift is a guess.",
      },
      {
        heading: "Greedy versus DP as a design decision",
        body: "The decision procedure: attempt an exchange argument. If it goes through, use greedy and enjoy O(n log n) with tiny constants and trivial code. If you find a counterexample, you have learned the problem needs DP and you have the counterexample as a test case, which is a strictly better outcome than guessing. If you can do neither in the time available, implement DP — it is the safe direction, since DP is never wrong where greedy is right, only slower. In production a third option often wins: use greedy for the fast path and reconcile against an exact solution offline, which is how many real scheduling and allocation systems actually run.",
      },
      {
        heading: "Interview framing",
        body: "The tell that you actually understand greedy is that you reach for a counterexample first. Say: 'Before committing to greedy I try to break it — coin change is the canonical example where the natural greedy rule is optimal for real currencies and wrong for arbitrary denominations, so denomination structure is doing hidden work.' Then, if greedy survives, give the exchange argument explicitly. And when discussing your own production code, be scrupulous about the distinction: 'my restock ranking is a heuristic that sorts by urgency, not a greedy algorithm with an optimality proof — the real problem is closer to a budget-constrained knapsack, and I chose the heuristic because it is explainable to a shop owner and the optimality gap was not worth the complexity'. That answer demonstrates you know the difference, which is the actual thing being tested.",
      },
    ],
    axonflux:
      "No greedy algorithm with a proof exists in this codebase, and you should not claim one. What does exist are two local-rule heuristics that share greedy's shape and none of its guarantees, and being precise about that distinction is the point. In scripts/cluster_product_names.py, once Union-Find has produced a cluster of similar barcodes, the canonical member is picked by a local rule — the first member that already has an app.products row, otherwise the lexicographically first. That is a deterministic tie-break, not an optimization. In sql/rebuild_derived/06_supplier_restock_recommendations.sql, products are ranked by urgency and staff act down the list; the underlying question — what to order given a limited purchase budget — is really a knapsack problem, and ranking is the greedy approximation to it, chosen because it is explainable to a shop owner and no one has measured the optimality gap. If you ever want a real greedy algorithm in this project, that budget-constrained procurement problem is where it belongs, and it should arrive with a measured comparison against an exact solver on historical data.",
    companies:
      "Huffman coding is greedy and sits inside gzip, PNG and JPEG. Kruskal and Prim build network topologies. Dijkstra powers routing in every mapping product and in link-state protocols like OSPF. Kubernetes' default scheduler scores nodes and greedily picks the best fit rather than solving an exact bin-packing. Ad auctions and CDN cache eviction (LRU is a greedy policy) run greedy rules at enormous scale precisely because O(n log n) with a small constant is the only thing that fits the latency budget.",
    whenNot:
      "When you cannot construct an exchange argument and the cost of a suboptimal answer is real — money, safety, or a decision a human will trust. When the problem has global constraints that a local view cannot see, such as a budget shared across categories. When fairness matters, since greedy scheduling starves the bottom of the queue. And when the input is small enough that exact DP or a solver runs in acceptable time — take the guarantee.",
    files: [
      { path: "scripts/cluster_product_names.py", note: "canonical-member pick after Union-Find — a local tie-break rule, not an optimization" },
      { path: "sql/rebuild_derived/06_supplier_restock_recommendations.sql", note: "urgency ranking — the greedy approximation to a budget-constrained knapsack nobody has solved exactly" },
    ],
    interview: [
      {
        q: "How do you decide between greedy and dynamic programming?",
        a: "I try to break greedy first. I look for a counterexample where the locally best choice forecloses the global optimum — coin change with denominations 1, 3, 4 asking for 6 is my standard probe, because it shows the greedy rule that works for real currency fails for arbitrary denominations, which means the denomination structure was carrying the proof. If I cannot find a counterexample, I try an exchange argument: can any optimal solution be rewritten to start with the greedy choice without getting worse? If that goes through, greedy is safe and I get O(n log n) instead of a table. If I fail at both under time pressure, I implement DP, because DP is never wrong where greedy is right — only slower.",
      },
      {
        q: "Give me a greedy algorithm you would defend, and one you would not.",
        a: "Defend: interval scheduling by earliest finish time. The exchange argument is clean — take any optimal schedule, swap its first interval for the earliest-finishing compatible one, and the count cannot decrease, so induct. Would not defend as optimal: the restock ranking in my own project. It sorts products by urgency and staff work down the list, which is greedy in shape, but the real problem is choosing purchases under a budget, which is knapsack, and ranking has no optimality guarantee there. I ship it anyway because it is explainable to a shop owner and the failure mode is mild, but I would not call it a greedy algorithm — I would call it a heuristic with an unmeasured optimality gap, and the honest next step is to measure that gap against an exact solver on historical data.",
      },
      {
        q: "Why does Dijkstra fail on negative edge weights?",
        a: "Because Dijkstra is greedy: it finalizes a node's distance the moment that node has the smallest tentative distance, on the assumption that no future path can improve it. That assumption holds only if every edge adds non-negative cost. A negative edge means a longer detour can arrive cheaper, so a finalized node may need revising and the greedy-choice property breaks. Bellman-Ford gives that up and relaxes all edges V-1 times, which is O(V*E) instead of O(E log V) — you pay the slowdown for correctness on a broader input class, and it detects negative cycles as a bonus.",
      },
    ],
    mentor: {
      deep: [
        "The greedy-choice property and how an exchange argument actually works",
        "Why greedy fails silently, and what instrumenting the gap looks like",
        "The difference between a greedy algorithm with a proof and a heuristic with the same shape",
      ],
      abstract: [
        "Matroid theory as the formal characterization of when greedy is optimal",
        "Specific approximation-ratio proofs",
        "Huffman's implementation details",
      ],
      mistakes: [
        "Assuming greedy works because it passed the examples you thought of",
        "Calling any ranking heuristic a greedy algorithm and implying guarantees",
        "Forgetting the sort key IS the algorithm — sorting by the wrong key silently changes correctness",
        "Ignoring starvation when greedy scheduling runs continuously",
      ],
    },
    exercises: [
      "Implement greedy coin change and find, by search, the smallest denomination set and target where it beats the optimum.",
      "Implement interval scheduling by earliest-finish and by shortest-duration; construct an input where the second loses.",
      "Formulate the budget-constrained restock problem as 0/1 knapsack, solve it exactly on one week of real data, and measure the gap against the current urgency ranking.",
      "Write the exchange argument for Kruskal's MST in your own words, without looking it up.",
    ],
    pos: { x: 14, y: 56 },
  },

  // ── 7. CONCURRENCY & PARALLELISM ────────────────────────────────────
  {
    id: "concurrency",
    title: "Concurrency & Parallelism",
    domain: "cs",
    difficulty: "advanced",
    status: "ready",
    tagline: "dealing with many things versus doing many things",
    analogy:
      "One chef juggling four pans is concurrency — a single worker interleaving tasks, making progress on all of them by switching whenever one is just simmering. Four chefs at four stations is parallelism — genuinely simultaneous work. The chef juggling pans is not faster at chopping; he is better at not standing idle. Almost every web server is the juggling chef, and understanding that distinction is the difference between fixing the right bottleneck and adding cores that do nothing.",
    problem:
      "A program that does one thing at a time wastes almost all of its wall-clock life waiting — for disk, for network, for a database. Meanwhile machines grew cores instead of clock speed. Both facts demand a way to overlap work, and overlapping work introduces a category of bug that does not exist in sequential code.",
    withoutIt:
      "One slow request blocks every other user. A long-running job holds your web worker hostage. You cannot use more than one core. And when you do add concurrency without understanding it, you get race conditions that reproduce once a week in production and never in testing.",
    prereqs: ["graphs-dags"],
    unlocks: ["operating-systems"],
    level1: [
      "Concurrency is structuring a program so multiple tasks are in flight; parallelism is executing multiple tasks at literally the same instant. Concurrency is a design property, parallelism is a hardware outcome. A single-core machine can be highly concurrent and not parallel at all — and for I/O-bound work, that is entirely sufficient, because the bottleneck was never the CPU.",
      "Three mechanisms, three cost profiles. Processes have separate memory, so they cannot corrupt each other and can use separate cores, but they are heavy to start and can only communicate through pipes, sockets or files. Threads share memory within one process, so communication is free and dangerous in equal measure. Async/await runs many tasks on one thread by yielding at await points — cheap, safe from data races within a task, and useless for CPU-bound work because nothing yields during computation.",
      "The decision rule that covers most cases: I/O-bound work wants async or threads, because the win comes from not blocking while waiting. CPU-bound work wants processes or a genuinely parallel runtime, because the win requires more cores. In Python this rule is sharpened by the Global Interpreter Lock, which prevents two threads from executing bytecode simultaneously — so Python threads help with I/O and do nothing for CPU-bound loops.",
    ],
    level2: [
      {
        heading: "Why FastAPI is async and what that buys",
        body: "A web server spends nearly all its time waiting on the database. With a thread-per-request model, a thousand concurrent requests means a thousand threads, each with its own stack, mostly parked — the memory and context-switch cost dominates. With an async event loop, a thousand concurrent requests are a thousand small coroutine objects on one thread, and the loop runs whichever one has data ready. The critical rule is that a single blocking call poisons the whole loop: one synchronous database query or one time.sleep inside an async handler blocks every other request on that worker. This is why mixing sync and async code correctly matters more than choosing async in the first place, and why FastAPI runs plain def handlers in a threadpool — a genuinely useful escape hatch that people forget exists.",
      },
      {
        heading: "The failure modes shared memory creates",
        body: "A race condition is any outcome that depends on timing. The classic is read-modify-write: two threads both read a counter as 5, both compute 6, both write 6, and one increment vanishes. The fix is a lock, and locks introduce their own failures. Deadlock — A holds lock 1 waiting for lock 2 while B holds lock 2 waiting for lock 1 — is prevented by always acquiring locks in a global order, which sounds trivial and is not, because lock ordering is a whole-codebase invariant that nothing enforces. Livelock is worse to diagnose: threads are active and making no progress. And the reason concurrency bugs are so hard is that they are not reproducible on demand; they surface as a wrong number once a week under load.",
      },
      {
        heading: "Avoiding the problem instead of solving it",
        body: "The most reliable concurrency strategy is to not share mutable state at all. Message passing — Go channels, actor systems, or plain queues — makes ownership explicit: only one task holds a value at a time. Process isolation goes further; separate address spaces mean shared-memory races are impossible by construction. Immutability removes the question entirely, which is exactly why derived.* being rebuilt rather than mutated sidesteps a whole class of problem. When you see a codebase reaching for processes or queues instead of locks, that is usually a deliberate choice to trade communication cost for the elimination of an entire bug category.",
      },
    ],
    level3: [
      {
        heading: "Why this repo runs the pipeline as a subprocess",
        body: "POST /api/pipeline/trigger does not import the pipeline and does not thread it. It spawns pipelines/weekly_pipeline.py with subprocess.Popen and streams its stdout line by line. That is a deliberate isolation choice with four distinct payoffs. A pipeline crash or OOM kills a child process, not the API server. The pipeline's heavy pandas and SQL work is CPU-bound, so a Python thread would fight the GIL and degrade API latency, while a separate process gets its own interpreter and its own core. The child is killable — api/routers/pipeline.py keeps a dict of run_id to Popen handle so a cancel request can find and terminate exactly the right run, which is far cleaner than trying to interrupt a thread mid-transaction. And the pipeline stays runnable from a plain terminal, which keeps it debuggable. The costs are equally real: process startup is slow, communication is line-oriented text over a pipe rather than shared objects, and stdout parsing is a fragile contract.",
      },
      {
        heading: "The gap this design leaves open",
        body: "Isolation does not give you mutual exclusion. Two clicks on the Refresh button spawn two pipeline processes, both of which TRUNCATE and rebuild derived.* — the second can truncate tables the first is still filling, producing a corrupt derived layer with no error raised anywhere. This is a race condition between processes, and the fact that no shared memory is involved does not help at all, because the shared mutable state is the database. The correct fix is a single-flight guard: a Postgres advisory lock, or a job queue with a concurrency limit of one, so the trigger itself is idempotent rather than just the work. Worth naming the general lesson — process isolation prevents memory races and says nothing about resource races.",
      },
      {
        heading: "Interview framing",
        body: "Lead with the distinction and the decision rule: 'Concurrency is structure, parallelism is execution. I/O-bound goes async, CPU-bound goes multiprocess, and in Python the GIL makes that rule sharper than elsewhere.' Then give the concrete design: 'My API runs its data pipeline as a subprocess rather than a thread — the work is CPU-bound so a thread would contend on the GIL, a crash cannot take down the API, and I keep a registry of run id to process handle so cancellation is a real kill rather than a cooperative flag.' Then volunteer the flaw, because volunteering it is the strongest move available: 'The gap is that I have isolation without mutual exclusion — two triggers race on TRUNCATE. The fix is a Postgres advisory lock or a queue with concurrency one, which makes the trigger idempotent and not just the work.'",
      },
    ],
    axonflux:
      "Concurrency here is mostly about isolation rather than speed. The FastAPI app in api/main.py is an async server, so many dashboard requests overlap while waiting on Postgres. The pipeline deliberately does NOT run in-process: api/routers/pipeline.py spawns pipelines/weekly_pipeline.py via subprocess.Popen, streams its stdout, and keeps a run_id-to-process dict so a cancel request can kill the correct child — chosen because the work is CPU-bound (GIL contention would hurt API latency) and because a crashed rebuild must not take the API down with it. The AI features add a second pattern: api/agents/router.py streams progress over Server-Sent Events so a long-running agent reports incrementally instead of blocking a request for minutes. The known open gap, documented rather than hidden, is that the trigger has no single-flight lock, so two rapid clicks race on TRUNCATE.",
    companies:
      "Nginx and Node built their reputations on event-loop concurrency for I/O-bound serving. Go made cheap green threads plus channels the default, which is why so much infrastructure is written in it. Every serious backend eventually separates web workers from background workers — Celery, Sidekiq, or a queue — for exactly the reason this repo uses a subprocess: long CPU-bound work must not live in the request path. Erlang and Elixir take isolation furthest, with millions of processes that share nothing.",
    whenNot:
      "Do not add concurrency to a program that is not waiting on anything and does not need more cores — you buy nondeterminism for free. Do not use threads for CPU-bound Python. Do not use async for CPU-bound anything, since a tight loop never yields and starves the event loop. And do not distribute across machines to solve a problem one machine's cores would handle; distribution adds partial failure, which is a strictly harder problem than concurrency.",
    files: [
      { path: "api/routers/pipeline.py", note: "subprocess.Popen + _active_procs registry — process isolation with real cancellation" },
      { path: "pipelines/weekly_pipeline.py", note: "the isolated CPU-bound child, still runnable standalone from a terminal" },
      { path: "api/agents/router.py", note: "SSE streaming so long agent runs report progress instead of blocking" },
      { path: "web/app/api/chat-proxy/route.ts", note: "the client half — a long-lived request that must not be cut off mid-flight" },
    ],
    interview: [
      {
        q: "Why run a long job as a subprocess instead of a thread?",
        a: "Four reasons in my case. Fault isolation — a crash or OOM in the job kills a child, not the API server. GIL avoidance — the work is CPU-bound pandas and SQL orchestration, so a Python thread would contend for the interpreter lock and degrade request latency for everyone. Real cancellation — I hold a map from run id to Popen handle, so cancel is a signal to a process rather than a cooperative flag a thread may never check. And debuggability — the same script runs from a terminal unchanged. The costs are process startup time, text-over-pipe communication instead of shared objects, and a stdout format that is now an implicit contract.",
      },
      {
        q: "What race condition does process isolation NOT protect you from?",
        a: "Anything where the shared mutable state lives outside memory. My own example: two clicks on the refresh button spawn two pipeline processes that both TRUNCATE and rebuild the same schema. Separate address spaces are irrelevant — the database is the shared resource, and the second process can truncate tables the first is still populating, with no error surfaced anywhere. The fix is mutual exclusion at the resource, not at the memory: a Postgres advisory lock or a job queue with concurrency one, which makes the trigger itself idempotent rather than only the work it performs.",
      },
      {
        q: "When does async actually help, and when does it not?",
        a: "It helps when tasks spend their time waiting — network, disk, database — because the event loop can run another coroutine during the wait, and coroutines are far cheaper than threads so you scale to very high concurrency on one core. It does not help for CPU-bound work at all, because nothing yields during a tight loop and one such task starves every other coroutine on that loop. The most common real bug is mixing the two: a single blocking synchronous call inside an async handler stalls the entire worker, which looks like a mysterious latency cliff under load rather than an obvious error.",
      },
    ],
    mentor: {
      deep: [
        "Concurrency versus parallelism, and the I/O-bound versus CPU-bound decision rule",
        "Why one blocking call poisons an entire event loop",
        "That isolation and mutual exclusion are different guarantees",
      ],
      abstract: [
        "Event loop implementation details (epoll, kqueue)",
        "Memory-model and instruction-reordering semantics",
        "Lock-free data structure design",
      ],
      mistakes: [
        "Using threads for CPU-bound Python and expecting a speedup",
        "A synchronous DB call inside an async handler",
        "Assuming separate processes means no race conditions",
        "Adding a lock without defining a global lock ordering",
      ],
    },
    exercises: [
      "Click the refresh button twice quickly on a local database copy and document exactly what the derived layer looks like afterwards.",
      "Implement the single-flight guard with a Postgres advisory lock and prove the second trigger is rejected rather than queued.",
      "Put time.sleep(5) inside an async FastAPI handler and measure what it does to concurrent requests; then swap it for asyncio.sleep and measure again.",
      "Read api/routers/pipeline.py and write down every failure mode of parsing subprocess stdout as a status contract.",
    ],
    pos: { x: 5, y: 66 },
  },

  // ── 8. OPERATING SYSTEMS ────────────────────────────────────────────
  {
    id: "operating-systems",
    title: "Operating Systems: Processes & Memory",
    domain: "cs",
    difficulty: "advanced",
    status: "ready",
    tagline: "the illusion every program lives inside",
    analogy:
      "An apartment building where every tenant is told they own the whole building. Each one addresses their rooms from 1 upward, and none of them can see or reach another tenant's space — the building manager silently translates every 'room 5' into a real physical location. Tenants who want to talk must go through the manager's official channels: a mail slot, a shared noticeboard. That translation layer is virtual memory, the tenants are processes, and the manager is the kernel.",
    problem:
      "Early machines ran one program with direct access to physical memory, so any bug corrupted everything, and only one thing could run at a time. Multiprogramming needed three illusions: that each program has the machine to itself, that each has a private contiguous address space, and that a misbehaving program cannot take down its neighbours.",
    withoutIt:
      "You cannot explain why a job died with no traceback, why memory usage looks impossible in top, why your container was killed at exactly its limit, or why a subprocess is a real safety boundary. You debug production by guessing.",
    prereqs: ["concurrency"],
    unlocks: ["networking"],
    level1: [
      "A process is a running program plus everything the kernel tracks about it: its address space, open file descriptors, and scheduling state. Its memory is virtual — addresses the program sees are translated to physical pages by hardware, using per-process page tables. Two processes using the same address touch entirely different physical memory, which is the isolation guarantee that makes subprocesses a safety boundary rather than a stylistic choice.",
      "Programs cannot touch hardware directly. Reading a file, opening a socket, or spawning a process means a system call — a controlled transition into kernel mode. Syscalls are relatively expensive, which is why buffering exists everywhere: reading a file byte by byte makes millions of syscalls, while reading in 8KB blocks makes hundreds.",
      "The scheduler decides which runnable process gets the CPU next, preempting on a timer so no process can monopolize the machine. Every context switch saves and restores register state and disturbs the caches, which is why a system with far more runnable threads than cores can spend more time switching than working.",
    ],
    level2: [
      {
        heading: "Virtual memory, paging, and the numbers in top",
        body: "Memory is managed in pages, typically 4KB. A page table maps virtual to physical pages, and because walking that table on every access would be ruinous, the TLB caches recent translations. When a program touches a page that is not resident, the hardware raises a page fault and the kernel loads it — which is how memory-mapped files work and why a process can appear to address more memory than physically exists. This also explains the two numbers people confuse: virtual size (VSZ) is address space reserved, which can be huge and meaningless, while resident set size (RSS) is actual physical pages held, which is what the OOM killer counts. Copy-on-write is the other essential trick: fork() gives the child a page table pointing at the parent's pages marked read-only, and pages are copied only when written — which is why forking a large process is cheap until the child starts mutating.",
      },
      {
        heading: "How processes talk when they share nothing",
        body: "Isolation means communication must be explicit. Pipes give a unidirectional byte stream between parent and child and are what subprocess.PIPE creates — the mechanism by which this repo's API reads pipeline progress. Signals are asynchronous notifications: SIGTERM asks a process to shut down and can be handled, SIGKILL cannot be caught and terminates immediately, and SIGSEGV is what you get for touching memory you do not own. Sockets work locally and across machines, which is why they underpin everything networked. Shared memory is the fastest option and reintroduces every race condition isolation was buying you protection from. Exit codes are the humblest channel and often enough: zero means success, non-zero means look at stderr.",
      },
      {
        heading: "The OOM killer and why jobs die silently",
        body: "Linux overcommits — it grants more virtual memory than it has physical pages, betting that most will not be touched. When that bet fails and physical memory genuinely runs out, the kernel's OOM killer picks a victim by score, heavily weighted toward the largest RSS, and sends an uncatchable SIGKILL. The victim gets no traceback, no cleanup, no exception. This is precisely why a Python process that loads millions of rows into pandas can vanish with only 'Killed' in the terminal, and why the diagnosis has to come from dmesg or the container's exit code (137 = 128 + 9, meaning SIGKILL) rather than from application logs. In a container, the cgroup memory limit triggers the same behaviour at the limit rather than at machine capacity, which is why a job that runs fine on a laptop dies in Kubernetes.",
      },
    ],
    level3: [
      {
        heading: "Reading the 2.9M-row OOM through an OS lens",
        body: "The ML baseline job pulling 2.9M rows into pandas is a textbook case. The Python process requested memory, the kernel happily returned virtual mappings, and RSS grew only as pages were actually touched during dataframe construction. Because pandas copies on many operations, peak RSS exceeded steady-state size — the transient copy is what pushed it over. The OOM killer chose it as the largest consumer and SIGKILLed it, which is why there was no traceback to read. The fix was to reduce what ever became resident: push the GROUP BY into Postgres, so the server streamed and aggregated with its own bounded work_mem and returned ~392K aggregated rows instead. Note the pattern that generalizes — the same discipline appears in raw_ingestion/common/ingest_core.py, which inserts in 2000-row chunks specifically so peak RSS is a function of chunk size rather than file size. Bounded memory is a design property you choose, not something you discover.",
      },
      {
        heading: "What a subprocess boundary actually costs and buys",
        body: "Spawning a process is orders of magnitude more expensive than a thread: a new address space, new page tables, a fresh Python interpreter, and re-imported modules. In exchange you get four guarantees threads cannot offer. Memory-fault isolation, since a segfault or OOM in the child leaves the parent's address space untouched. Resource accounting, since the child has its own RSS and can be cgroup-limited independently. Genuine killability, since SIGKILL always works while a thread stuck in a C extension may be uninterruptible. And a clean crash contract via exit codes. This repo takes that trade knowingly in api/routers/pipeline.py; the same reasoning is why the PDF renderer in api/tools/pamphlets/render/pdf.py drives a separate browser process through Playwright rather than trying to render in-process. The honest cost is that every boundary turns rich objects into serialized text, and text formats become implicit contracts that break quietly.",
      },
      {
        heading: "Interview framing",
        body: "Show that you debug at the OS layer rather than only the application layer. 'A job disappeared with no traceback and exit code 137. That is 128 plus 9 — SIGKILL — so the OOM killer took it, which means the question is RSS, not logic. I confirmed with dmesg, then fixed it by pushing aggregation into the database so the resident footprint dropped from 2.9M raw rows to about 392K aggregated ones.' Then articulate the boundary decision: 'I run the pipeline as a subprocess because I want fault isolation, independent resource accounting, and a real kill signal — a thread gives me none of those, and the price is process startup and a text-over-pipe contract.' Knowing that virtual size and resident size are different numbers, and which one the kernel kills on, is a small fact that reliably separates people who have operated systems from people who have only written code.",
      },
    ],
    axonflux:
      "Present in the operational reality of this project rather than in any file that says 'operating system'. The pipeline runs as a genuinely separate OS process (subprocess.Popen in api/routers/pipeline.py) precisely for the kernel-level guarantees: separate address space, independent memory accounting, and a kill signal that actually works — the run_id-to-process registry exists so cancel can send that signal to the right child. Progress reaches the API through a pipe, one line at a time. The 2.9M-row pandas OOM was an OOM-killer event, diagnosed as a resident-set problem and fixed by moving aggregation into Postgres (~392K rows returned). Chunked inserts in raw_ingestion/common/ingest_core.py bound peak RSS by design. And PDF rendering in api/tools/pamphlets/render/pdf.py spawns a Playwright browser process — another deliberate process boundary around code too heavy and too crash-prone to host in the API's own address space.",
    companies:
      "Containers are the OS primitives made into a product: namespaces provide isolated views of processes, network and filesystem, while cgroups enforce CPU and memory limits — the same limits whose breach produces exit code 137 in every Kubernetes cluster. Databases manage their own buffer pools rather than trusting the page cache, for the same reason they manage their own scheduling. Chrome's per-tab process model and this repo's per-pipeline subprocess are the same design idea at wildly different scales.",
    whenNot:
      "Do not reach for OS-level tuning when the problem is an algorithm or a missing index — that is almost always the real cause and it is a far cheaper fix. Do not manage memory manually in a garbage-collected runtime. Do not build process supervision by hand when systemd, a container runtime, or a job queue already does it correctly. And do not use shared memory for IPC unless you have measured that serialization is genuinely your bottleneck, because you are reintroducing every race condition process isolation just eliminated.",
    files: [
      { path: "api/routers/pipeline.py", note: "Popen, pipes, and a run_id-to-process registry so SIGTERM reaches the right child" },
      { path: "raw_ingestion/common/ingest_core.py", note: "2000-row chunks — peak RSS bounded by chunk size, not file size" },
      { path: "ml/train.py", note: "the ML path behind the 2.9M-row OOM-killer event" },
      { path: "api/tools/pamphlets/render/pdf.py", note: "Playwright drives a separate browser process — another deliberate isolation boundary" },
    ],
    interview: [
      {
        q: "A job dies with no traceback and exit code 137. Diagnose it.",
        a: "137 is 128 + 9, meaning SIGKILL, and the overwhelmingly common source of an uncatchable SIGKILL is the OOM killer — either the kernel under real memory pressure or a cgroup limit in a container. No traceback is the tell, since SIGKILL cannot be handled so no Python exception path runs. I would confirm in dmesg or the container's termination reason, then look at resident set size over time rather than at the algorithm. In my own case this was a pandas job loading 2.9M rows; the fix was pushing the aggregation into Postgres so only ~392K aggregated rows were ever resident. Raising the limit would have been the wrong instinct — it moves the cliff instead of removing it.",
      },
      {
        q: "What does a subprocess give you that a thread does not?",
        a: "A separate address space, so a segfault or OOM in the child cannot corrupt or kill the parent. Independent resource accounting, so the child can be memory-limited and measured on its own. A kill signal that reliably works, whereas a thread blocked in a C extension may simply never notice your cancellation flag. And a clean crash contract via exit code. What you pay is startup cost, loss of shared objects, and communication reduced to serialized bytes over a pipe — which quietly turns your output format into an interface. I made that trade deliberately for a data pipeline triggered from an API, because the pipeline crashing must never take the API with it.",
      },
      {
        q: "Explain virtual memory to someone who only reads top.",
        a: "The two columns people conflate are VSZ and RSS. VSZ is address space the process has reserved — it can be enormous and largely meaningless, because Linux overcommits and reserving costs nothing until you touch it. RSS is physical pages actually resident, and that is what the OOM killer scores on. The mechanism connecting them is demand paging: the kernel maps addresses without backing them, and only on first touch does a page fault allocate real memory. That is also why fork() is cheap — copy-on-write hands the child page tables pointing at the parent's pages, and copies happen only on write.",
      },
    ],
    mentor: {
      deep: [
        "Virtual versus resident memory, and which one gets you killed",
        "Why process boundaries are a real isolation guarantee",
        "Signals: what SIGTERM allows that SIGKILL does not",
        "That syscalls are expensive, hence buffering everywhere",
      ],
      abstract: [
        "Page table walk mechanics and TLB internals",
        "Scheduler algorithm details (CFS, EEVDF)",
        "Filesystem journaling internals",
      ],
      mistakes: [
        "Reading VSZ and concluding the process is using that much memory",
        "Expecting a traceback from an OOM kill",
        "Raising the memory limit instead of reducing the resident footprint",
        "Assuming SIGKILL runs your cleanup handlers — it does not",
      ],
    },
    exercises: [
      "Run the pipeline and watch its RSS with top or Process Explorer; find the peak and identify which step causes it.",
      "Write a script that allocates until it is OOM-killed, then find the kill in dmesg and confirm exit code 137.",
      "Send SIGTERM and then SIGKILL to a running pipeline and document which cleanup happens in each case.",
      "Change the ingest chunk size from 2000 to 200000 and measure both peak RSS and total runtime; explain the shape of the trade.",
    ],
    pos: { x: 14, y: 76 },
  },

  // ── 9. NETWORKING ───────────────────────────────────────────────────
  {
    id: "networking",
    title: "Networking: TCP, HTTP, TLS",
    domain: "cs",
    difficulty: "intermediate",
    status: "ready",
    tagline: "layers of promises over unreliable wire",
    analogy:
      "Sending a long letter through a postal system that loses, reorders, and duplicates envelopes. You number every page, the recipient acknowledges what arrived, and you resend anything unacknowledged — now an unreliable channel behaves like a reliable one. That is TCP. Writing the letter in a language and format both parties agreed on is HTTP. Sealing each envelope so the postal workers can carry it but not read it is TLS. Each layer solves exactly one problem and hands a cleaner abstraction upward.",
    problem:
      "Physical networks lose packets, reorder them, duplicate them, and let anyone on the path read them. Applications want a reliable ordered private byte stream to a named service. Every layer of the stack exists to close one specific gap between those two realities.",
    withoutIt:
      "Timeouts, CORS errors, TLS handshake failures and mysterious 30-second disconnections are unexplainable events you fix by trial and error. You cannot reason about latency, cannot debug why a request works in curl and not in the browser, and cannot design an API that behaves well under real network conditions.",
    prereqs: ["operating-systems"],
    unlocks: ["compilers"],
    level1: [
      "The layers you actually deal with: IP routes packets between machines with no reliability promise at all. TCP adds sequence numbers, acknowledgements and retransmission on top of IP to give an ordered reliable byte stream, plus congestion control so senders back off rather than collapsing the network. TLS encrypts and authenticates that stream. HTTP defines request/response semantics — methods, status codes, headers — on top. Each layer only knows about the one below it.",
      "A TCP connection begins with a three-way handshake (SYN, SYN-ACK, ACK), costing one full round trip before any data moves. Adding TLS costs one or two more round trips to negotiate cipher and verify certificates, though TLS 1.3 cut this to one and can resume at zero. On a 100ms link that is 200-300ms spent before the first byte of your request is sent — which is why connection reuse and keep-alive matter far more than most people assume.",
      "HTTP is stateless: the server remembers nothing between requests, so every request must carry its own identity. That is why tokens exist. A JWT is a signed, self-describing token — the server verifies the signature rather than looking the session up, which scales beautifully and creates the well-known problem that a valid token cannot be revoked before it expires.",
    ],
    level2: [
      {
        heading: "Timeouts and where they actually live",
        body: "There is no single timeout; there is a chain of them, and the smallest one wins. Connect timeout, TLS handshake timeout, request write timeout, response read timeout, and then every proxy, load balancer and platform in the path with its own idle limit. A request that dies at exactly 30 or 60 seconds is almost never your code — it is a fixed limit in something between you and the server. This repo has a precise example: Next.js rewrite-based proxying drops connections after roughly 30 seconds, which is fatal for AI chat calls that legitimately run for minutes. The fix in web/app/api/chat-proxy/route.ts is a real route handler instead of a rewrite, since a route handler has no such limit and waits as long as its own fetch does — set explicitly there to a 5-minute AbortSignal. The transferable lesson is that when a timeout is suspiciously round, go looking for the layer that owns that number rather than tuning your own code.",
      },
      {
        heading: "Streaming: why SSE, and why not WebSockets",
        body: "Request/response breaks down when work takes minutes and the user needs progress. Three options. Polling is simple, wasteful, and adds latency equal to half the poll interval. WebSockets give full duplex over an upgraded connection and cost you a different protocol, different auth handling, and proxies that may not cooperate. Server-Sent Events is plain HTTP with a text/event-stream content type: the server holds the response open and writes newline-delimited events, the browser's EventSource reconnects automatically, and every existing HTTP header and auth mechanism keeps working. For one-directional progress reporting — exactly the AI agent case in api/agents/router.py — SSE is the right size of tool. Reach for WebSockets only when the client genuinely needs to push too.",
      },
      {
        heading: "CORS, and why it confuses everyone",
        body: "CORS is enforced by the browser, not the server, and it protects the user rather than the API. When JavaScript on origin A calls origin B, the browser demands that B explicitly opts in via Access-Control-Allow-Origin. This is why a request works perfectly in curl and fails in the browser — curl has no same-origin policy to enforce. Non-simple requests trigger a preflight OPTIONS round trip first, which is an extra RTT on every call unless you set a max-age. A hardcoded backend origin is the classic way to break this: the project rule that NEXT_PUBLIC_API_BASE_URL must stay empty exists because baking in a hostname breaks every client that is not on that exact host — phone over Tailscale, LAN, anything. Relative URLs keep same-origin true for every caller, which sidesteps CORS entirely.",
      },
    ],
    level3: [
      {
        heading: "Latency, bandwidth, and head-of-line blocking",
        body: "Bandwidth improves with money; latency is bounded by physics. That asymmetry means round trips dominate perceived performance for small payloads, so the optimization that matters is reducing round trips — connection reuse, HTTP/2 multiplexing, TLS 1.3 resumption — not compressing an already-small body. HTTP/2 multiplexes many streams over one TCP connection, which fixed application-level head-of-line blocking but not the TCP-level version: one lost packet stalls every multiplexed stream, because TCP insists on in-order delivery of the whole connection. HTTP/3 solves it by abandoning TCP for QUIC over UDP, implementing per-stream ordering in userspace. That progression is a good thing to be able to narrate, because it shows a layer's guarantee (TCP's total ordering) becoming a liability once the layer above wants independent streams.",
      },
      {
        heading: "JWT trade-offs, stated honestly",
        body: "A JWT carries its claims and a signature, so any server with the key can verify it without a database lookup — stateless, horizontally scalable, no shared session store. The cost is revocation: a stolen or stale token stays valid until it expires, so 'log out everywhere' and 'this user was just demoted' cannot be enforced without reintroducing state. The standard mitigation is short-lived access tokens plus a refresh token, which shrinks the exposure window but does not close it, and a denylist for emergencies, which is server state again. There is also a real security footgun in the format itself: never trust the alg header, since accepting alg=none or letting an attacker switch RS256 to HS256 is a known family of vulnerabilities. And a JWT is signed, not encrypted — anyone holding it can read the payload, so no secrets belong inside.",
      },
      {
        heading: "Interview framing",
        body: "Debugging stories beat definitions. 'AI chat requests were dying at almost exactly 30 seconds. A suspiciously round number means a fixed limit in a layer I do not own, not a bug in my code — it turned out to be the framework's rewrite-based proxy. I moved the call to a route handler, which has no such limit, and set an explicit 5-minute abort so the timeout is a decision I made rather than one I inherited.' On streaming, show you pick the smallest sufficient tool: 'SSE over WebSockets for one-way progress, because it is plain HTTP — existing auth headers, existing proxies, automatic reconnect — and I would only upgrade to WebSockets if the client needed to push.' On JWT, always volunteer the revocation problem before you are asked; naming your own design's weakness is the strongest available move.",
      },
    ],
    axonflux:
      "The whole product is a network system, and several decisions here are network decisions. web/app/api/chat-proxy/route.ts exists for one reason: the framework's rewrite proxy severs connections at about 30 seconds, and AI chat calls legitimately run for minutes — so the proxy is a route handler with an explicit 300-second AbortSignal, and the comment in the file says exactly that. api/agents/router.py streams agent progress over Server-Sent Events so a multi-minute run reports incrementally rather than looking hung. api/core/security.py issues and verifies JWTs, giving stateless auth with the revocation trade-off that implies. And the project rule that NEXT_PUBLIC_API_BASE_URL must stay empty is a same-origin decision: a hardcoded hostname breaks every non-localhost client — phone over Tailscale, LAN, anything else — while relative URLs keep every caller same-origin and CORS-free.",
    companies:
      "Cloudflare and Google drove HTTP/3 and QUIC adoption precisely because TCP head-of-line blocking hurt real users on lossy mobile networks. gRPC uses HTTP/2 multiplexing with protobuf for internal service-to-service calls where the schema is shared. Every SaaS runs mutual TLS or signed tokens between services. And every engineer eventually learns the 30-second lesson: the load balancer, not the application, owns the timeout.",
    whenNot:
      "Do not use HTTP between processes on the same machine when a pipe or a Unix socket is simpler and faster — this repo talks to its pipeline over a pipe for exactly that reason. Do not use WebSockets for one-directional updates; SSE is less machinery. Do not build a custom binary protocol before HTTP has measurably failed you. And do not put JWT auth on an internal call path that never crosses a trust boundary — you are paying for a guarantee you already have.",
    files: [
      { path: "web/app/api/chat-proxy/route.ts", note: "route handler instead of a rewrite — dodges the ~30s proxy cut, explicit 300s AbortSignal" },
      { path: "api/agents/router.py", note: "Server-Sent Events for incremental agent progress" },
      { path: "api/core/security.py", note: "JWT issue and verify — stateless auth, with the revocation trade-off" },
      { path: "api/main.py", note: "the HTTP surface: routers, CORS, static mounts" },
    ],
    interview: [
      {
        q: "Requests fail at almost exactly 30 seconds. What is your first move?",
        a: "A suspiciously round number means a configured limit in a layer I do not own, not a race or a bug. So I enumerate the path — browser, framework proxy or rewrite, CDN, load balancer, application server — and find which one owns 30 seconds. I hit that exact case: the framework's rewrite-based proxy severs long connections at about 30 seconds, which killed AI chat calls that legitimately take minutes. The fix was to stop routing through the rewrite and use a real route handler, which has no such limit, with an explicit 5-minute abort signal so the timeout is a decision I made rather than one I inherited. The general principle is that every hop has its own timeout and the smallest one always wins.",
      },
      {
        q: "SSE, WebSockets, or polling for long-running progress?",
        a: "SSE for one-directional server-to-client progress, which is the common case. It is plain HTTP, so existing auth headers, proxies and observability all keep working, and the browser's EventSource reconnects on its own. WebSockets when the client also needs to push — collaborative editing, live cursors — and I accept the cost of a separate protocol with its own auth story and proxies that sometimes refuse the upgrade. Polling only when the update rate is very low or infrastructure forbids long-lived connections, since it wastes requests and adds half the poll interval as latency. I use SSE for agent progress here because the client has nothing to say mid-run.",
      },
      {
        q: "Why is a JWT harder to revoke than a session, and what would you do about it?",
        a: "Because the whole point of a JWT is that verification is local — the server checks a signature instead of consulting a store, which is what makes it stateless and horizontally scalable. The flip side is that there is no store to delete from, so a token stays valid until it expires no matter what happens to the user. Mitigations, in order of cost: short-lived access tokens with refresh tokens, which shrinks the window rather than closing it; a denylist keyed by token id, which reintroduces exactly the shared state you were avoiding but only for the emergency path; and a per-user token version claim checked against the database, which is a lookup but a very cheap one. I would also note that JWTs are signed and not encrypted, so nothing sensitive belongs in the payload, and that the alg header must never be trusted from the token itself.",
      },
    ],
    mentor: {
      deep: [
        "The layer model, and which layer owns which guarantee",
        "That every hop has a timeout and the smallest wins",
        "Why CORS is a browser policy protecting users, not a server policy protecting APIs",
        "JWT statelessness and the revocation trade-off",
      ],
      abstract: [
        "TCP congestion control algorithm details",
        "TLS cipher suite negotiation internals",
        "QUIC packet framing",
      ],
      mistakes: [
        "Hardcoding a backend hostname and breaking every non-localhost client",
        "Blaming application code for a round-numbered timeout",
        "Putting sensitive data in a JWT payload because it 'looks encoded'",
        "Reaching for WebSockets when the data only flows one way",
      ],
    },
    exercises: [
      "Capture a full request with the browser devtools network panel and label DNS, connect, TLS, TTFB and download separately.",
      "Decode one of the app's JWTs at jwt.io and write down exactly what an attacker learns from a stolen token.",
      "Reintroduce a hardcoded API base URL locally and confirm which clients break and with what error.",
      "Add a deliberate 45-second endpoint and prove which layer cuts it when called through the rewrite versus the route handler.",
    ],
    pos: { x: 5, y: 86 },
  },

  // ── 10. COMPILERS & INTERPRETERS ────────────────────────────────────
  {
    id: "compilers",
    title: "Compilers & Interpreters",
    domain: "cs",
    difficulty: "advanced",
    status: "ready",
    tagline: "text in, structure out, behaviour after",
    analogy:
      "A sheet of music. The printed page is text — dots and lines that mean nothing physically. A musician reads it into an internal understanding of structure: this is a phrase, this is a chord, this repeats. Then they either perform it directly, which is interpretation, or arrange and print parts for an orchestra to play later, which is compilation. Same source, two strategies, and both begin with the same act of turning flat text into a tree of meaning.",
    problem:
      "Humans want to express intent in something readable; machines execute something else entirely. Bridging the two requires a repeatable way to recognize structure in text, verify that the structure means something legal, and transform it into whatever the executor understands.",
    withoutIt:
      "Every configuration format is parsed with regular expressions and string splitting, which works until it does not. You cannot build a domain-specific language, cannot give useful error messages, cannot reason about why a query is slow, and you treat your own database's optimizer as unknowable magic.",
    prereqs: ["networking"],
    unlocks: [],
    level1: [
      "The classic pipeline: lexing turns a character stream into tokens; parsing turns tokens into an abstract syntax tree that captures structure; semantic analysis checks that the tree means something legal (types match, names exist, required fields present); optimization rewrites the tree or an intermediate representation into a cheaper equivalent; and code generation emits the target — machine code, bytecode, or another language entirely.",
      "Compilation and interpretation are strategies over the same front end. A compiler does the whole pipeline ahead of time and produces an artifact; an interpreter walks the tree or executes bytecode immediately. Most real systems blend the two: Python compiles to bytecode then interprets it, and JavaScript engines interpret first and JIT-compile the hot paths once they know which ones matter.",
      "The idea generalizes far past programming languages. Any time you take structured input, validate it, and turn it into behaviour or another format, you have built a front end whether you meant to or not. Template engines, query planners, build configuration, and JSON-shaped domain-specific languages all follow the same shape, and recognizing that shape is what lets you build them deliberately rather than accidentally.",
    ],
    level2: [
      {
        heading: "The AST is the load-bearing idea",
        body: "An abstract syntax tree drops syntactic noise and keeps structure: parentheses vanish because nesting is now the tree's shape. This matters because a tree is something you can walk, validate, rewrite, and render, while text is only something you can pattern-match against and hope. Once you have a typed tree, three separate concerns cleanly separate — validation walks it and reports errors with positions, transformation rewrites nodes into other nodes, and rendering walks it emitting output. Trying to do all three against raw text is where DSLs turn into regex soup that nobody dares change.",
      },
      {
        heading: "Tagged unions, discriminated by a type field",
        body: "The standard way to represent an AST in a language without algebraic data types is a tagged union: every node carries a type field, and the set of legal shapes for each tag is declared. The renderer dispatches on that tag, which means adding a node type is a local change — declare the shape, add one dispatch branch — rather than a scattered edit. This is precisely how this repo's pamphlet DSL works: api/tools/pamphlets/render/primitives.py declares node models with Literal-typed discriminators (page, section, and so on), and validation falls out of the schema definition rather than being hand-written. The pattern is worth internalizing because it is the same one behind Rust enums, TypeScript discriminated unions, and every JSON-based configuration language you will ever design.",
      },
      {
        heading: "Query planners are compilers with a cost model",
        body: "SQL is declarative — you state what you want, never how — so the database must compile it. It parses SQL to a tree, rewrites it (view expansion, predicate pushdown, subquery flattening), then enumerates physical plans: which index, which join algorithm, which join order. It chooses using a cost model fed by table statistics, which is the one big difference from a language compiler: the optimizer's decisions depend on data, not just on code. That is why the same query gets a different plan as your tables grow, why stale statistics produce bad plans, and why EXPLAIN ANALYZE is the right debugging tool — it is asking the compiler to show its output.",
      },
    ],
    level3: [
      {
        heading: "Designing a DSL: the trade you are actually making",
        body: "A DSL buys you a constrained surface. The pamphlet DSL in this repo has a fixed set of node types, which means an LLM can generate a layout and the system can validate it before rendering — an invalid node is rejected at the schema boundary rather than producing a broken PDF or, far worse, arbitrary executable output. That is the real motivation: a constrained tree is safe to accept from an untrusted generator in a way that raw HTML or a template string never is. The costs are equally concrete. Every node type is a permanent API you must keep rendering forever. Error messages are yours to write, and bad ones make the DSL miserable. And there is a constant temptation toward Turing-completeness — add conditionals, then loops, then variables — at which point you have written a programming language badly instead of a document format well. The discipline is to keep it declarative and let the layer above compute.",
      },
      {
        heading: "Multi-stage lowering and where bugs hide",
        body: "This repo's pamphlet pipeline is a real multi-stage lowering: a JSON DSL tree is validated (validator.py), lowered to HTML (html.py), then rendered to PDF or PNG by a headless browser (pdf.py). Each stage is a compiler pass with its own intermediate representation, and each boundary is a place errors can be lost or misattributed. The failure mode worth naming: an error introduced at stage one surfaces as a visual defect at stage three, where the information needed to explain it no longer exists — the HTML no longer knows which DSL node produced it. Real compilers solve this with source maps, carrying original positions through every transformation, which is exactly why a JavaScript stack trace can point at your TypeScript line. If a lowering pipeline gets more than two stages deep, threading provenance through it stops being optional.",
      },
      {
        heading: "Interview framing",
        body: "Frame the DSL as a safety decision, not a convenience: 'I needed an LLM to generate document layouts. Free-form HTML from a model is unvalidatable and unsafe, so I defined a constrained DSL of a fixed set of node types with discriminated-union schemas. Generation becomes structured output against a schema, validation happens before rendering, and the blast radius of a bad generation is a rejected payload rather than a broken document.' Then show you know the costs: every node type is a permanent contract, error message quality is entirely your problem, and the pressure to add control flow must be resisted or you have built a bad programming language. On query planners, the sentence that lands is: 'EXPLAIN is asking a compiler to show its work, and the reason plans change without the query changing is that this particular compiler optimizes against statistics rather than only against code.'",
      },
    ],
    axonflux:
      "There is a genuine interpreter in this codebase. The pamphlet and campaign system is built on a domain-specific language: api/tools/pamphlets/render/primitives.py declares the node types as Pydantic models discriminated by Literal type tags — the AST schema. api/tools/pamphlets/render/validator.py is the semantic analysis pass, rejecting structurally invalid trees before anything is rendered. api/tools/pamphlets/render/html.py is the code generator, walking the tree and lowering it to HTML. api/tools/pamphlets/render/pdf.py drives a headless browser to lower HTML to PDF or PNG. That is parse, validate, lower, emit — a real compiler pipeline, built for a specific reason: the DSL is what makes LLM-generated layouts safe to accept, because a constrained tree can be validated where free-form HTML cannot. Separately and just as real, every SQL file in sql/rebuild_derived/ is compiled by the Postgres planner into a physical execution plan, which is why EXPLAIN ANALYZE — not intuition — is how query performance gets diagnosed here.",
    companies:
      "LLVM is the shared middle end behind Clang, Rust and Swift, which is why they share optimization work. V8 and the JVM tier up from interpretation to JIT compilation based on runtime profiling. Babel and TypeScript are source-to-source compilers. Every database ships a query optimizer. Terraform, Kubernetes manifests and CI configuration files are all declarative DSLs with validation front ends — and the current wave of LLM tool-calling is the same idea again: constrain the output to a schema so it can be checked before it is executed.",
    whenNot:
      "Do not build a DSL when a schema-validated JSON config or an existing template engine will do — the maintenance cost is permanent and larger than it looks. Do not hand-write a parser when a grammar tool or a schema library gives you validation and errors for free. Do not add control flow to a document format. And do not write your own optimizer when the database has one that is better than yours and gets improved by other people every release.",
    files: [
      { path: "api/tools/pamphlets/render/primitives.py", note: "AST node schemas — Pydantic models discriminated by Literal type tags" },
      { path: "api/tools/pamphlets/render/validator.py", note: "semantic analysis — reject invalid trees before rendering" },
      { path: "api/tools/pamphlets/render/html.py", note: "code generation — tree walk lowering the DSL to HTML" },
      { path: "api/tools/pamphlets/render/pdf.py", note: "final lowering stage — headless browser emits PDF/PNG" },
      { path: "sql/rebuild_derived/05_necessary_views.sql", note: "SQL the Postgres planner compiles into a physical plan — EXPLAIN shows its output" },
    ],
    interview: [
      {
        q: "Why build a DSL instead of letting the model emit HTML directly?",
        a: "Safety and validatability. Free-form HTML from a language model cannot be meaningfully checked — you either accept whatever it produces or write a sanitizer that is itself a parser. A constrained DSL with a fixed set of node types and a schema per type turns generation into structured output, so an invalid layout is rejected at the schema boundary before anything renders. It also makes the failure mode small: a bad generation is a rejected payload, not a broken document or an injection vector. The costs are that every node type is a permanent contract I have to keep rendering, and that I must resist adding conditionals and loops, because at that point I have written a programming language badly instead of a document format well.",
      },
      {
        q: "What is an AST and why not just use regular expressions?",
        a: "An AST is a tree that captures the structure of the input with the syntactic noise removed — nesting becomes the shape of the tree rather than matched delimiters in text. Regular expressions cannot describe arbitrary nesting at all; that is a formal limitation, not a matter of effort, since balanced structures are not a regular language. Practically, the tree is what lets validation, transformation and rendering be three separate passes over the same data structure instead of one tangle of string operations. It is also what makes good error messages possible, because a node knows where it came from and what it is.",
      },
      {
        q: "Explain what a query planner does in compiler terms.",
        a: "It is a compiler with a cost model. SQL is parsed into a tree, rewritten logically — view expansion, predicate pushdown, subquery flattening — and then the optimizer enumerates physical plans: which access path, which join algorithm, which join order. Selinger-style join ordering is itself dynamic programming over subsets of relations. The distinguishing feature versus a language compiler is that it optimizes against table statistics rather than only against code, which is why the same SQL gets a different plan as data grows and why stale statistics cause bad plans. EXPLAIN ANALYZE is how you read the compiler's output, and the estimated-versus-actual row counts are how you tell whether it was compiling with accurate information.",
      },
    ],
    mentor: {
      deep: [
        "Why an AST beats text manipulation, and the formal reason regexes cannot nest",
        "Tagged unions discriminated by a type field, as the standard AST representation",
        "That declarative input plus a cost model equals an optimizer",
      ],
      abstract: [
        "LR versus LL parsing theory",
        "Register allocation and SSA form",
        "JIT tiering heuristics",
      ],
      mistakes: [
        "Parsing nested structure with regular expressions",
        "Letting a DSL grow control flow until it is an unplanned programming language",
        "Losing source positions across lowering stages, making errors unattributable",
        "Treating the query planner as magic instead of reading EXPLAIN",
      ],
    },
    exercises: [
      "Add one new node type to the pamphlet DSL end to end — schema, validation, HTML lowering — and note every file you had to touch.",
      "Feed the validator a deliberately malformed DSL tree and judge whether the error message would help someone who did not write the validator.",
      "Run EXPLAIN ANALYZE on the heaviest query in sql/rebuild_derived/ and describe the physical plan as a compiler's output.",
      "Write a tiny arithmetic expression interpreter — lexer, parser, tree-walking evaluator — in under 150 lines, then explain where you would add a source map.",
    ],
    pos: { x: 14, y: 96 },
  },
];
