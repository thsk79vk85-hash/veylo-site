// TEST ONLY. Attempt every owned teardown; keep the original failure first.
export async function withOwnedCleanup(body,teardowns){
  let value;const errors=[];
  try{value=await body();}catch(error){errors.push(error);}
  const bodyFailed=errors.length>0;
  for(const teardown of teardowns){try{await teardown();}catch(error){errors.push(error);}}
  if(bodyFailed&&errors.length===1)throw errors[0];
  if(errors.length)throw new AggregateError(errors,'Owned fixture operation/cleanup failed.');
  return value;
}
