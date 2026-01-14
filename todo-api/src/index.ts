import { serve } from "@hono/node-server";
import "dotenv/config";
import { Hono } from "hono";
import { cors } from "hono/cors"; // 追加
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

interface Todo {
  id: number;
  title: string;
  completed: boolean;
}

const app = new Hono();

// Prisma 7ではadapterが必須
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// 追加
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  })
);

app.get("/", (c) => {
  return c.text("Hello Hono!");
});

app.get("/todos", async (c) => {
  const todos: Todo[] = await prisma.todo.findMany();
  return c.json(todos);
});

app.post("/todos", async (c) => {
  const { title } = await c.req.json();
  const todo = await prisma.todo.create({
    data: {
      title,
      completed: false,
    },
  });
  return c.json({ todo }, 201);
});

app.put("/todos/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const { completed } = await c.req.json();
  try {
    const todo = await prisma.todo.update({
      where: { id },
      data: { completed },
    });
    return c.json({ todo });
  } catch (error) {
    return c.json({ error }, 404);
  }
});

const port = Number(process.env.PORT) || 3000;

serve(
  {
    fetch: app.fetch,
    port: port,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  }
);
