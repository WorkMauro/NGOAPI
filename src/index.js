require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const fs = require("fs");
const path = require("path");
const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + "-" + file.originalname);
  },
});
const upload = multer({ storage: storage, limits: {fileSize: 4 * 1024 * 1024}, fileFilter(req, file, cb) {
  if (!file.originalname.match(/\.(jpg|jpeg|png)$/)) {
    alert("Favor envie um comprovante de residencia no formato JPEG, PNG ou JPEG")
    return cb(new Error('Por favor, envie uma imagem no formato jpg, jpeg ou png'));
  } cb(null, true)
} });

mongoose
  .connect(process.env.MONGODB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("Conectado ao MongoDB com sucesso!");
  })
  .catch((err) => {
    console.error("Erro ao conectar ao MongoDB:", err);
  });

const doacaoSchema = new mongoose.Schema({
  numeroPessoas: Number,
  kitHigiene: String,
  agua: String,
  alimentos: String,
  roupas: String,
  prodLimp: String,
  nome: String,
  whatsapp: Number,
  endAfe: String,
  endAtu: String,
  image_url: String,
});

const doacao = mongoose.model("doacao", doacaoSchema);
const doacaoRejeitada = mongoose.model("doacaoRejeitada", doacaoSchema);
const doacaoAceita = mongoose.model("doacaoAceita", doacaoSchema);
const doacaoFinalizada = mongoose.model("doacaoFinalizada", doacaoSchema);

app.get("/", async (req, res) => {
  try {
    const pedidos = await doacao.find();
    res.send(pedidos);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.delete("/:id", async (req, res) => {
  try {
    const pedidos = await doacao.findByIdAndDelete(req.params.id);
    res.send(pedidos);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.put("/:id", async (req, res) => {
  try {
    const pedidos = await doacao.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
    });
    res.send(pedidos);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post("/", upload.single("image_url"), async (req, res) => {
  console.log(req.file)
  try {
    const pedido = new doacao({
      numeroPessoas: req.body.numeroPessoas,
      kitHigiene: req.body.kitHigiene,
      agua: req.body.agua,
      alimentos: req.body.alimentos,
      roupas: req.body.roupas,
      prodLimp: req.body.prodLimp,
      nome: req.body.nome,
      whatsapp: req.body.whatsapp,
      endAfe: req.body.endAfe,
      endAtu: req.body.endAtu,
      image_url: req.file ? req.file.path : "",
    });
    await pedido.save();
    res.send(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

app.post("/doacaoRejeitada", checkToken, async (req, res) => {
  try {
    const pedido = new doacaoRejeitada(req.body);
    await pedido.save();
    res.send(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

app.post("/doacaoAceita", checkToken, async (req, res) => {
  try {
    const pedido = new doacaoAceita(req.body);
    await pedido.save();
    res.send(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

app.get("/doacaoAceita", async (req, res) => {
  try {
    const pedidos = await doacaoAceita.find();
    res.send(pedidos);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

function checkToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  console.log("Cabeçalho de autorização recebido:", authHeader);

  if (!authHeader) {
    console.log("Token não fornecido");
    return res.status(403).send({ msg: "Token não fornecido" });
  }

  const token = authHeader.split(" ")[1];
  console.log("Token recebido:", token);

  if (!token) {
    console.log("Token inválido");
    return res.status(403).send({ msg: "Token inválido" });
  }

  jwt.verify(token, process.env.SECRET, (err, decoded) => {
    if (err) {
      console.log("Erro ao verificar token:", err.message);
      return res.status(403).send({ msg: "Token inválido" });
    }

    console.log("Token verificado com sucesso:", decoded);
    req.user = decoded;
    next();
  });
}

app.put("/moveDoacaoRejeitada/:id", checkToken, async (req, res) => {
  console.log("Rota /moveDoacaoRejeitada/:id acessada");
  console.log(`ID recebido: ${req.params.id}`);
  try {
    const pedido = await moveDoacao(req.params.id, doacaoRejeitada);
    res.send(pedido);
  } catch (error) {
    console.error(error);
    res.status(500).send(error.message);
  }
});

app.put("/moveDoacaoAceita/:id", checkToken, async (req, res) => {
  try {
    const { id } = req.params;
    const newPedido = await moveDoacao(id, doacaoAceita);
    res.json(newPedido);
  } catch (error) {
    console.error(error);
    res.status(500).send("Erro ao mover a doação");
  }
});

app.put("/DoacaoAceita/:id", checkToken, async (req, res) => {
  console.log("Rota /DoacaoAceita/:id acessada");
  console.log(`ID recebido: ${req.params.id}`);
  try {
    const pedido = await moveDoacao(req.params.id, doacaoFinalizada);
    res.send(pedido);
  } catch (error) {
    console.error(
      `Erro ao mover a doação com ID ${req.params.id} para doacaoFinalizada:`,
      error
    ); // Log de erro específico para esta rota
    res.status(500).send(error.message);
  }
});

app.put("/moveDoacaoFinalizada/:id", checkToken, async (req, res) => {
  console.log("Rota /moveDoacaoFinalizada/:id acessada");
  console.log(`ID recebido: ${req.params.id}`);
  try {
    const pedido = await moveDoacaoToFinalizada(req.params.id, doacaoAceita);
    res.send(pedido);
  } catch (error) {
    console.error(`Erro ao mover a doação com ID ${req.params.id}:`, error); // Log de erro específico para esta rota
    res.status(500).send(error.message);
  }
});

const User = mongoose.model("User", {
  usuario: String,
  senha: String,
});

app.get("/user/:id", checkToken, async (req, res) => {
  const id = req.params.id;
  const user = await User.findById(id, "-senha");

  if (!user) {
    return res.status(404).json({ msg: "Usuário Não encontrado" });
  }

  res.status(200).json({ user });
});

app.post("/auth/register", async (req, res) => {
  const { usuario, senha } = req.body;
  if (!usuario || !senha) {
    return res.status(422).json({ msg: "Usuário e senha são obrigatórios" });
  }
  const userExists = await User.findOne({ usuario: usuario });
  if (userExists) {
    return res
      .status(422)
      .json({ msg: "Este usuário já existe, por favor insira outro usuário" });
  }
  const salt = await bcrypt.genSalt(12);
  const passwordHash = await bcrypt.hash(senha, salt);
  const user = new User({
    usuario,
    senha: passwordHash,
  });
  try {
    await user.save();
    res.status(201).json({ msg: "Usuário criado com sucesso" });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      msg: "Aconteceu um erro no servidor, tente novamente mais tarde",
    });
  }
});

app.post("/auth/login", async (req, res) => {
  const { usuario, senha } = req.body;

  console.log("Iniciando processo de login...");

  if (!usuario || !senha) {
    console.log("Usuário e senha são obrigatórios");
    return res.status(422).json({ msg: "Usuário e senha são obrigatórios" });
  }

  console.log("Procurando usuário no banco de dados...");
  const user = await User.findOne({ usuario: usuario });

  if (!user) {
    console.log("Usuário não encontrado");
    return res.status(404).json({ msg: "Usuário não encontrado" });
  }

  console.log("Comparando senha...");
  const checkPassword = await bcrypt.compare(senha, user.senha);

  if (!checkPassword) {
    console.log("Senha inválida");
    return res.status(422).json({ msg: "Senha inválida" });
  }

  try {
    console.log("Gerando token...");
    const secret = process.env.SECRET;

    if (!secret) {
      console.error("Variável de ambiente SECRET não está definida");
      return res.status(500).json({ msg: "Erro na configuração do servidor" });
    }

    const token = jwt.sign({ id: user._id }, secret);
    console.log("Autenticação realizada com sucesso");
    res.status(200).json({ msg: "Autenticação realizada com sucesso", token });
  } catch (error) {
    console.error("Erro ao gerar token:", error);
    res.status(500).json({
      msg: "Aconteceu um erro no servidor, tente novamente mais tarde",
    });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});

async function moveDoacao(id, targetCollection) {
  console.log(`Iniciando o processo de mover doação com ID: ${id}`);

  try {
    const pedido = await doacao.findById(id);
    console.log(`Pedido encontrado: ${JSON.stringify(pedido)}`); // Log para verificar o pedido encontrado

    if (!pedido) {
      console.error(`Doação com ID: ${id} não encontrada`);
      throw new Error("Doação não encontrada");
    }

    console.log(`Doação encontrada: ${JSON.stringify(pedido)}`);

    const newPedido = new targetCollection(pedido.toObject());
    await newPedido.save();

    await doacao.findByIdAndDelete(id);
    console.log(
      `Doação com ID: ${id} movida com sucesso para ${targetCollection.collection.collectionName}`
    );

    return newPedido;
  } catch (error) {
    console.error(
      `Erro ao mover a doação com ID ${id} para ${targetCollection.collection.collectionName}:`,
      error
    );
    throw error; // Lançar o erro para ser capturado na rota
  }
}

async function moveDoacaoToFinalizada(id) {
  console.log(`Iniciando o processo de mover doação com ID: ${id}`);

  try {
    const pedido = await doacaoAceita.findById(id); // Busca na coleção doacaoAceita
    console.log(`Pedido encontrado: ${JSON.stringify(pedido)}`); // Adicionando log para verificar o pedido encontrado

    if (!pedido) {
      console.error(`Doação com ID: ${id} não encontrada`);
      throw new Error("Doação não encontrada");
    }

    console.log(`Doação encontrada: ${pedido}`);

    const newPedido = new doacaoFinalizada(pedido.toObject()); // Cria um novo documento na coleção doacaoFinalizada
    await newPedido.save();

    await doacaoAceita.findByIdAndDelete(id); // Remove o documento da coleção doacaoAceita
    console.log(
      `Doação com ID: ${id} movida com sucesso para doacaoFinalizada`
    );

    return newPedido;
  } catch (error) {
    console.error("Erro ao mover a doação:", error);
    throw error; // Lança o erro para ser capturado na rota
  }
}
