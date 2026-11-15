const common = { scenarioLabel: '模拟场景', room: { width: 6, depth: 5 }, door: { wall: 'south', offset: 2, width: 1, swing: 'inward', hinge: 'low' }, obstacles: [], seatTemplate: { tableWidth: 1, tableDepth: 0.6, tableHeight: 0.75, chairWidth: 0.5, chairDepth: 0.5, chairClearance: 0.6, approachWidth: 0.5 }, targetSeats: 2, requiredSeats: 2, passageWidth: 0.8, gridSize: 0.2, tolerance: 1e-6, seed: 'fixture' };
const clone = x => structuredClone(x);
export const fixtures = [
 { name:'normal-manual-two-seats', kind:'normal', input:clone(common), layout:{seats:[{id:'manual-a',x:1.2,z:3.5,orientation:0},{id:'manual-b',x:4.5,z:3.5,orientation:0}]}, expected:'layout-pass', expectedSeats:2 },
 { name:'normal-small', kind:'normal', input:clone(common), expected:'search-pass', expectedSeats:2 },
 { name:'baseline-open-two-seat', kind:'baseline', input:clone(common), expected:'baseline-pass', expectedSeats:2 },
 { name:'normal-obstacle', kind:'normal', input:{...clone(common), obstacles:[{id:'pillar-1',x:4,z:3,width:.5,depth:.5,height:2}]}, expected:'search-pass', expectedSeats:2 },
 { name:'normal-rotation-90', kind:'normal', input:{...clone(common),targetSeats:1,requiredSeats:1}, layout:{seats:[{id:'rot90',x:4,z:3,orientation:90}]}, expected:'layout-pass', expectedSeats:1, require90:true },
 { name:'normal-three-obstacles', kind:'normal', input:{...clone(common),obstacles:[{id:'a',x:1,z:3,width:.3,depth:.3,height:1},{id:'b',x:3,z:3,width:.3,depth:.3,height:1},{id:'c',x:5,z:3,width:.3,depth:.3,height:1}]}, expected:'search-pass', expectedSeats:2 },
 { name:'boundary-one-seat', kind:'boundary', input:{...clone(common),targetSeats:1,requiredSeats:1}, expected:'search-pass', expectedSeats:1 },
 { name:'boundary-three-obstacle-limit', kind:'boundary', input:{...clone(common),obstacles:[{id:'a',x:1,z:3,width:.3,depth:.3,height:1},{id:'b',x:3,z:3,width:.3,depth:.3,height:1},{id:'c',x:5,z:3,width:.3,depth:.3,height:1}]}, expected:'search-pass', expectedSeats:2 },
 { name:'boundary-door-equals-passage', kind:'boundary', input:{...clone(common),door:{...common.door,width:.8},passageWidth:.8}, expected:'search-pass', expectedSeats:2 },
 { name:'boundary-door-offset-zero', kind:'boundary', input:{...clone(common),door:{...common.door,offset:0}}, expected:'search-pass', expectedSeats:2 },
 { name:'failure-negative-room', kind:'failure', input:{...clone(common),room:{width:-1,depth:5}}, expected:'schema-fail', errorCode:'room.dimension' },
 { name:'failure-door-outside', kind:'failure', input:{...clone(common),door:{...common.door,offset:5.5,width:1}}, expected:'schema-fail', errorCode:'door.bounds' },
 { name:'failure-four-obstacles', kind:'failure', input:{...clone(common),obstacles:[{id:'a',x:1,z:1,width:1,depth:1,height:1},{id:'b',x:2,z:1,width:1,depth:1,height:1},{id:'c',x:3,z:1,width:1,depth:1,height:1},{id:'d',x:4,z:1,width:1,depth:1,height:1}]}, expected:'schema-fail', errorCode:'obstacles.count' },
 { name:'failure-illegal-orientation', kind:'failure', input:clone(common), layout:{seats:[{id:'bad',x:3,z:3,orientation:45},{id:'bad2',x:4,z:3,orientation:0}]}, expected:'layout-fail', errorCode:'seat.orientation' },
 { name:'failure-door-too-narrow', kind:'failure', input:{...clone(common),door:{...common.door,width:.5}}, layout:{seats:[{id:'a',x:4,z:3,orientation:0},{id:'b',x:5,z:3,orientation:0}]}, expected:'layout-fail', errorCode:'door-width' },
 { name:'failure-out-of-bounds', kind:'failure', input:clone(common), layout:{seats:[{id:'edge',x:.1,z:.1,orientation:0},{id:'edge2',x:4,z:4,orientation:0}]}, expected:'layout-fail', errorCode:'out-of-bounds' },
 { name:'failure-hinge', kind:'failure', input:{...clone(common),door:{...common.door,hinge:'bad'}}, expected:'schema-fail', errorCode:'door.hinge' },
 { name:'failure-obstacle-outside', kind:'failure', input:{...clone(common),obstacles:[{id:'wall',x:0,z:3,width:2,depth:1,height:1}]}, expected:'schema-fail', errorCode:'obstacle.bounds' },
 { name:'failure-null-obstacle', kind:'failure', input:{...clone(common),obstacles:[null]}, expected:'schema-fail', errorCode:'obstacle.type' }
];
