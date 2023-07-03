import express from "express"
import dotenv from "dotenv"
import cors from "cors"
import { MongoClient, ObjectId } from "mongodb"
import joi from "joi"
import dayjs from "dayjs"

const app = express()

dotenv.config()
app.use(cors())
app.use(express.json())

const mongoClient = new MongoClient(process.env.DATABASE_URL)

try {
    await mongoClient.connect()

} catch (error) {
    console.log(error)
}

const db = mongoClient.db()

app.post("/participants", async function(req, res) {
    const { name } = req.body

    const schemaBody = joi.object({
        name: joi.required().strict()
    })
    const validateSchemaBody = schemaBody.validate(req.body)

    if ( validateSchemaBody.error ) {
        const errors = validateSchemaBody.error.details.map(e => e.message)
        return res.status(409).send(errors)
    }

    try {
        const searchName = await db.collection("participants").findOne({ name: name })

        if( searchName !== null ) {
            return res.sendStatus(422)
        }

        await db.collection("participants").insertOne({ 
            name: name, 
            lastStatus: Date.now()
        })

        await db.collection("messages").insertOne({
            from: name,
            to: "Todos",
            text: "entra na sala...",
            type: "statuts",
            time: dayjs().format("HH:mm:ss")
        })

        res.sendStatus(201)

    } catch (err) {
        console.log(err)
        res.sendStatus(500)
    }

})

app.get("/participants", async function(req, res) {
    try {
        const participants = await db.collection("participants").find({}).toArray()
        return res.status(200).send(participants)

    } catch (err) {
        console.log(err)
        res.sendStatus(500)
    }
})

app.post("/messages", async function(req, res) {
    const { to, text, type } = req.body
    const { name } = req.headers

    const typeAccepted = ["message", "private_message"]

    const schemaBody = joi.object({
        to: joi.string().required(),
        text: joi.string().required(),
        type: joi.string().required().valid(...typeAccepted)
    })

    const schemaHeaders = joi.required()

    const validateSchemaBody = schemaBody.validate(req.body)
    const validateSchemaHeaders = schemaHeaders.validate(name)
    
    if ( validateSchemaBody.error ) {
        const errors = validateSchemaBody.error.details.map(e => e.message)
        return res.status(422).send(errors)

    } else if ( validateSchemaHeaders.error ) {
        const errors = validateSchemaHeaders.error.details.map(e=> e.message)
        return res.status(422).send(errors)
    }

    try {
        const searchName = await db.collection("participants").findOne({ name: name })

        if ( searchName === null ) {
            return res.sendStatus(403)
        }

        await db.collection("messages").insertOne({ 
            from: name,
            to: to,
            text: text,
            type: type,
            time: dayjs().format("HH:mm:ss")
        })

        res.sendStatus(201)

    } catch (err) {
        console.log(err)
        return res.sendStatus(500)
    }

})

app.get("/messages", async function(req, res) {
    const { user } = req.headers
    const { limit } = req.query

    try {
        const searchName = await db.collection("participants").findOne({ name: user })
        
        if ( searchName === null ) {
            return res.sendStatus(403)
        }

        const getMessages = await db.collection("messages").find({
            $or: [
                { to: "Todos"},
                { to: user },
                { from: user}
            ]
        }).toArray()

        if ( limit ) {
            const schemaQuery = joi.string().required().pattern(/^[1-9]\d*$/)

            const validateQuery = schemaQuery.validate(limit)

            if ( validateQuery.error ) {
                const errors = validateQuery.error.details.map(e => e.message)
                return res.status(422).send(errors)
            }

            const lastElements = getMessages.slice(-limit)

            return res.status(200).send(lastElements)
        }

        res.status(200).send(getMessages)

    } catch (err) {
        console.log(err)
        res.sendStatus(500)
    }

})

app.post("/status", async function(req, res) {
    const { user } = req.headers

    const schemaHeaders = joi.required()

    const validateSchemaHeaders = schemaHeaders.validate(user)

    if ( validateSchemaHeaders.error ) {
        const errors = validateSchemaHeaders.error.details.map(e=> e.message)
        return res.status(404).send(errors)
    }

    try {
        const searchName = await db.collection("participants").findOne({ name: user })

        if ( searchName === null ) {
            return res.sendStatus(404)
        }

        await db.collection("participants").updateOne(
            { 
                _id: new ObjectId(searchName._id) 
            }, 
            {
                $set: { 
                    lastStatus: Date.now()
                }
            }
        )

        res.sendStatus(200)

    } catch (err) {
        console.log(err)
        res.sendStatus(500)
    }

})

setInterval(async () => {
    try {
        const getParticipant = await db.collection("participants").find({ lastStatus: { $lt: Date.now() - 10000 } }).toArray()

        getParticipant.map(async (user) => {
            await db.collection("participants").deleteOne({ _id: new ObjectId(user._id) })
            await db.collection("messages").insertOne({
                from: user.name,
                to: "Todos",
                text: "sai da sala...",
                type: "status",
                time: dayjs().format("HH:mm:ss")
            })
        })

    } catch (err) {
        console.log(err)
    }
}, 15000)

const PORT = process.env.PORT | 5000

app.listen(PORT, () => console.log(`Running server in port ${PORT}`))