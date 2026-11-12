"""Reproducible route-content-v1 maps. Run locally; never changes published content implicitly."""
import json, random
from pathlib import Path
RNG = random.Random(20261112)

def neighbors(cell, n):
    r,c=divmod(cell,n)
    return [rr*n+cc for rr,cc in [(r-1,c),(r,c+1),(r+1,c),(r,c-1)] if 0<=rr<n and 0<=cc<n]

def paths(n, blocked, start, goal):
    graph={c:[v for v in neighbors(c,n) if v not in blocked] for c in range(n*n) if c not in blocked}
    found=[]; visits=0
    def walk(path,seen):
        nonlocal visits
        visits+=1
        if visits>60000 or len(found)>5000:raise OverflowError()
        at=path[-1]
        if at==goal:found.append(path[:]);return
        for v in graph[at]:
            if v not in seen:walk(path+[v],seen|{v})
    walk([start],{start})
    return found,visits

def make(stage, ids):
    band=(stage-1)//5; role=(stage-1)%5
    n=[4,4,5,5,6,6][band]; count=[0,1,1,2,2,3][band]
    for attempt in range(100000):
        free_count=RNG.randint(*[(10,13),(11,13),(15,18),(17,20),(21,24),(22,25)][band])
        start,goal=0,n*n-1
        free={start,goal}|set(RNG.sample(list(range(1,n*n-1)),free_count-2));blocked=set(range(n*n))-free
        connected={start};front=[start]
        for cell in front:
            for v in neighbors(cell,n):
                if v in free and v not in connected:connected.add(v);front.append(v)
        if connected!=free:continue
        try: all_paths,visits=paths(n,blocked,start,goal)
        except OverflowError:continue
        if len(all_paths)<2:continue
        direct=min(map(len,all_paths))-1
        if band==0 and max(map(len,all_paths))-1<=direct:continue
        witness=RNG.choice(all_paths)
        if len(witness)<count+2:continue
        required=sorted(RNG.sample(witness[1:-1],count),key=witness.index)
        including=[p for p in all_paths if all(v in p for v in required)]
        ordered=band>=4
        valid=[p for p in including if not ordered or [p.index(v) for v in required]==sorted(p.index(v) for v in required)]
        if not valid:continue
        shortest=min(map(len,valid))-1
        if band in (1,2) and shortest<=direct:continue
        if band==3 and len({tuple(v for v in p if v in required) for p in including})<2:continue
        if ordered and len(valid)==len(including):continue
        limit=shortest+[2,4,0,2,0][role] if band==5 else None
        if limit is not None and max(map(len,valid))-1<=limit:continue
        # Apply a symmetry to vary entry direction while preserving all proof results.
        transform=RNG.randrange(8)
        def move(cell):
            r,c=divmod(cell,n)
            if transform>=4:c=n-1-c
            for _ in range(transform%4):r,c=c,n-1-r
            return r*n+c
        start,goal=move(start),move(goal);blocks=sorted(map(move,blocked));points=list(map(move,required))
        key=f"rp1:{n}:{start}:{goal}:{'.'.join(map(str,blocks))}:{'.'.join(map(str,points))}:{'o' if ordered else 'a'}:{limit if limit is not None else 'n'}"
        if key in ids:continue
        ids.add(key)
        return dict(id=key,size=n,start=start,goal=goal,blocked=blocks,required=points,ordered=ordered,limit=limit,shortest=shortest),visits
    raise RuntimeError(f'No verified map for stage {stage}')

if __name__=='__main__':
    ids=set();bank=[];maximum=0
    for stage in range(1,31):
        entries=[]
        for _ in range(5):
            q,visits=make(stage,ids);entries.append(q);maximum=max(maximum,visits)
        bank.append(entries)
    output=Path(__file__).resolve().parents[1]/'src/lib/route-bank.json'
    # One map per line keeps the content artifact reviewable.
    output.write_text('[\n'+',\n'.join('  [\n'+',\n'.join('    '+json.dumps(q,separators=(',',':')) for q in entries)+'\n  ]' for entries in bank)+'\n]\n')
    print(f'Verified {len(ids)} distinct maps across 30 stages; max search nodes {maximum}.')
