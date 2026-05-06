const {Pool}=require('pg');
const pool=new Pool({user:'postgres',host:'localhost',database:'easyfinder',port:5432});
const listings=[
  {id:'demo-ex-001',equipment:'2019 Caterpillar 320 Excavator',price:87500,market_value:92000,hours:3800,score:74,state:'CA',source:'auctionplanet',operable:true,category:'excavator',description:'Single owner, full service history, new tracks 2023.'},
  {id:'demo-wl-001',equipment:'2018 Komatsu WA380 Wheel Loader',price:68000,market_value:75000,hours:4200,score:68,state:'TX',source:'ironplanet',operable:true,category:'wheel_loader',description:'Clean machine, recent hydraulic service, ready to work.'},
  {id:'demo-bd-001',equipment:'2020 John Deere 850L Bulldozer',price:142000,market_value:155000,hours:2100,score:82,state:'WA',source:'verified_partner',operable:true,category:'bulldozer',description:'Low hours, inspection report available, dealer maintained.'},
  {id:'demo-ss-001',equipment:'2017 Bobcat S650 Skid Steer',price:31000,market_value:28000,hours:5900,score:41,state:'FL',source:'auction',operable:true,category:'skid_steer',description:'High hours, some hydraulic wear, priced above market.'},
  {id:'demo-ex-002',equipment:'2016 Hitachi ZX210 Excavator',price:54000,market_value:61000,hours:7200,score:55,state:'AZ',source:'dealer',operable:false,category:'excavator',description:'Non-operable — engine issue. Parts or repair project.'},
];
async function seed(){
  for(const l of listings){
    await pool.query(`INSERT INTO listings (id,equipment,price,market_value,hours,score,state,source,operable,category,description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET price=EXCLUDED.price,score=EXCLUDED.score,hours=EXCLUDED.hours`,
      [l.id,l.equipment,l.price,l.market_value,l.hours,l.score,l.state,l.source,l.operable,l.category,l.description]);
    console.log('seeded:',l.id);
  }
  await pool.end();
  console.log('done');
}
seed().catch(e=>{console.error(e);process.exit(1);});
