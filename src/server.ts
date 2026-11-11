import { app } from './app';
import { config } from './config';

app.listen(config.port, () => {
  console.log(`Job portal API running on http://localhost:${config.port}`);
});
