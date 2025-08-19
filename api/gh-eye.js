// api/gh-eye-express.js

const express = require("express");
const { Octokit } = require("@octokit/rest");

const app = express();
app.use(express.json());

const token = process.env.GITHUB_TOKEN;
const owner = process.env.GITHUB_REPO_OWNER;
const repo = process.env.GITHUB_REPO_NAME;

if (!token || !owner || !repo) {
  throw new Error("Missing required environment variables.");
}

const octokit = new Octokit({ auth: token });

// 创建 Issue
app.post("/api/create-issue", async (req, res) => {
  const { title, body } = req.body;
  try {
    const result = await octokit.issues.create({ owner, repo, title, body });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 给 Issue 添加评论
app.post("/api/add-comment", async (req, res) => {
  const { issue_number, comment } = req.body;
  try {
    const result = await octokit.issues.createComment({
      owner,
      repo,
      issue_number,
      body: comment,
    });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 上传 CSV 文件到仓库
app.post("/api/upload-csv", async (req, res) => {
  const { path, content, message } = req.body;
  let sha = undefined;
  try {
    const { data } = await octokit.repos.getContent({ owner, repo, path });
    sha = data.sha;
  } catch (e) {
    // 文件不存在时会报错，忽略
  }
  try {
    const result = await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path,
      message: message || "Upload CSV",
      content: Buffer.from(content).toString("base64"),
      sha,
    });
    res.json(result.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 健康检查
app.get("/", (req, res) => {
  res.send("GitHub API Proxy is running.");
});

// 启动服务
const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`API proxy listening on port ${port}`);
});
