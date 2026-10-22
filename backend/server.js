import 'dotenv/config';
import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware (will have Middleware folder for middle fxns)
app.use(cors());
app.use(express.json());

// Routes (moving routes into dedicated folder)
app.get('/api/v1/health', (req, res) => {
	res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
	console.log(`server running on PORT ${PORT}`);
});
