let arr = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function forAwait() {
  const results = [];
  for (let i of arr) {
    results.push(sleep(i * 100));
  }
  await Promise.all(results);
}

forAwait();
