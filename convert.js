import api from "@actual-app/api";
import Exchange from "./lib/exchangeRates.js";
import Config from "./config.js";

(async () => {
  await api.init({
    dataDir: "./actual-cache",
    serverURL: process.env.ACTUAL_SERVER_URL || "http://localhost:5006",
    password: process.env.ACTUAL_PASSWORD,
  });

  await api.downloadBudget(Config.syncId);

  for (let account of Config.convertAccounts) {
    try {
      const exchange = new Exchange({
        fromCurrency: account.fromCurrency,
        toCurrency: Config.toCurrency,
        history: Config.history,
      });
      let transactions = await api.getTransactions(account.id);
      let count = 0;
      // Check if all transactions have been converted.
      transactions = transactions.filter(
        (transaction) =>
          !transaction.notes?.includes(`${account.fromCurrency} @`)
      );
      if (transactions.length === 0) {
        console.log(
          `No transactions to convert for account ${account.id} (${account.fromCurrency} to ${Config.toCurrency}).`
        );
        continue;
      }
      await exchange.getRates();
      for (let transaction of transactions) {
        // Skip transactions that have already been converted.
        if (transaction.notes?.includes(`${account.fromCurrency} @`)) {
          continue;
        }
        // NOTE: values are in cents; rounded after conversion.
        const amount = exchange.applyRate(transaction.amount, transaction.date);
        if (!amount) {
          console.warn(
            `Skipping transaction ${JSON.stringify(
              transaction
            )} as no conversion rate was found.`
          );
          continue;
        }
        // Get the exchange rate used for conversion
        const rate = exchange.getRate(transaction.date);
        // Format the original and converted amounts for display (convert from cents to currency units)
        const originalAmount = (Math.abs(transaction.amount) / 100).toFixed(2);
        await api.updateTransaction(transaction.id, {
          notes: `${originalAmount} ${account.fromCurrency} @ ${rate.toFixed(2)}${transaction.notes ? ' • ' + transaction.notes : ''}`,
          amount: amount,
        });
        count++;
      }
      console.log("Converted", count, "transactions.");
    } catch (e) {
      console.error(e);
    }
  }

  await api.shutdown();
})();
