import mongoose from "mongoose"
import dotenv from 'dotenv'
dotenv.config()

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.DB_STRING)

    console.log(`MongoDB Connected`)
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

export default connectDB
