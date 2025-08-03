export default async function handler(request, response) {
  // 1. 验证必要环境变量（防止部署后功能失效）
  const requiredEnv = [
    'GITHUB_TOKEN',
    'GITHUB_REPO_OWNER',
    'GITHUB_REPO_NAME'
  ];
  const missingEnv = requiredEnv.filter(key => !process.env[key]);
  if (missingEnv.length > 0) {
    return response
      .status(500)
      .json({ 
        error: '服务器配置错误', 
        message: `缺少环境变量: ${missingEnv.join(', ')}` 
      });
  }

  // 2. CORS 配置（单一来源处理，避免冲突）
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = [
    'https://Enqiliu66.github.io',
    'http://localhost:5500',
    'http://localhost:3000'
  ];
  const isAllowed = allowedOrigins.includes(origin);
  const corsHeaders = {
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',  // 只允许必要方法
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400'
  };
  if (isAllowed) {
    corsHeaders['Access-Control-Allow-Origin'] = origin;
  }

  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return response
      .set(corsHeaders)
      .status(200)
      .end();
  }

  // 设置响应头
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });
  response.headers.set('Content-Type', 'application/json');

  // 3. 处理业务逻辑
  try {
    if (request.method !== 'POST') {
      return response
        .status(405)
        .json({ error: '方法不允许', message: '仅支持 POST 请求' });
    }

    // 解析请求体（增强错误提示）
    let body;
    try {
      body = await request.json();
    } catch (e) {
      return response
        .status(400)
        .json({ error: '请求格式错误', message: '请提交 valid JSON 数据' });
    }

    const { action } = body;
    if (!action) {
      return response
        .status(400)
        .json({ 
          error: '缺少参数', 
          message: '必须指定 action（create_issue/add_comment/upload_csv）' 
        });
    }

    // 4. GitHub API 基础配置
    const githubApiBase = 'https://api.github.com';
    const repoPath = `repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`;
    const authHeader = `token ${process.env.GITHUB_TOKEN}`;
    const userAgent = 'Eye-ED-Proxy';  // 符合 GitHub API 要求的 User-Agent

    // 超时处理（避免长期挂起）
    const fetchWithTimeout = async (url, options, timeout = 8000) => {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('请求超时')), timeout)
        )
      ]);
    };

    // 5. 按 action 处理请求
    switch (action) {
      case 'create_issue': {
        const { subjectId, gender, age } = body;
        if (!subjectId) {
          return response
            .status(400)
            .json({ error: '缺少参数', message: 'subjectId 为必填项' });
        }

        // 查找现有 Issue
        const searchUrl = new URL(`${githubApiBase}/search/issues`);
        searchUrl.searchParams.set('q', `repo:${repoPath}+title:${subjectId}+type:issue`);
        
        const searchRes = await fetchWithTimeout(searchUrl.toString(), {
          headers: { 'Authorization': authHeader, 'User-Agent': userAgent }
        });

        if (!searchRes.ok) {
          const errData = await searchRes.json().catch(() => ({}));
          throw new Error(`搜索 Issue 失败: ${errData.message || searchRes.statusText}`);
        }

        const searchData = await searchRes.json();
        if (searchData.total_count > 0) {
          return response.status(200).json(searchData.items[0]);
        }

        // 创建新 Issue
        const createRes = await fetchWithTimeout(`${githubApiBase}/${repoPath}/issues`, {
          method: 'POST',
          headers: { 
            'Authorization': authHeader, 
            'Content-Type': 'application/json',
            'User-Agent': userAgent 
          },
          body: JSON.stringify({
            title: subjectId,
            body: `被试信息:\n- 性别: ${gender || '未知'}\n- 年龄: ${age || '未知'}\n- 开始时间: ${new Date().toISOString()}`
          })
        });

        const issueData = await createRes.json();
        return response.status(createRes.status).json(issueData);
      }

      case 'add_comment': {
        const { issueNumber, commentBody } = body;
        if (!issueNumber || !commentBody) {
          return response
            .status(400)
            .json({ error: '缺少参数', message: 'issueNumber 和 commentBody 为必填项' });
        }

        const commentRes = await fetchWithTimeout(
          `${githubApiBase}/${repoPath}/issues/${issueNumber}/comments`,
          {
            method: 'POST',
            headers: { 
              'Authorization': authHeader, 
              'Content-Type': 'application/json',
              'User-Agent': userAgent 
            },
            body: JSON.stringify({ body: commentBody })
          }
        );

        if (!commentRes.ok) {
          const errData = await commentRes.json().catch(() => ({}));
          throw new Error(`添加评论失败: ${errData.message || commentRes.statusText}`);
        }

        const commentData = await commentRes.json();
        return response.status(200).json(commentData);
      }

      case 'upload_csv': {
        const { fileName, content } = body;
        if (!fileName || !content || !fileName.endsWith('.csv')) {
          return response
            .status(400)
            .json({ error: '参数错误', message: '需提供 valid CSV 文件名和内容' });
        }

        // 步骤1: 创建 blob
        const blobRes = await fetchWithTimeout(`${githubApiBase}/git/blobs`, {
          method: 'POST',
          headers: { 
            'Authorization': authHeader, 
            'Content-Type': 'application/json',
            'User-Agent': userAgent 
          },
          body: JSON.stringify({
            content: btoa(unescape(encodeURIComponent(content))),  // 兼容 Edge 的 base64 编码
            encoding: 'base64'
          })
        });

        if (!blobRes.ok) {
          const errData = await blobRes.json().catch(() => ({}));
          throw new Error(`创建 blob 失败: ${errData.message || blobRes.statusText}`);
        }
        const { sha: blobSha } = await blobRes.json();

        // 步骤2: 获取分支最新提交
        const defaultBranch = process.env.GITHUB_DEFAULT_BRANCH || 'main';
        const refRes = await fetchWithTimeout(
          `${githubApiBase}/${repoPath}/git/refs/heads/${defaultBranch}`,
          { headers: { 'Authorization': authHeader, 'User-Agent': userAgent } }
        );

        if (!refRes.ok) {
          const errData = await refRes.json().catch(() => ({}));
          throw new Error(`获取分支失败: ${errData.message || refRes.statusText}`);
        }
        const { object: { sha: commitSha } } = await refRes.json();

        // 步骤3: 获取当前树
        const commitRes = await fetchWithTimeout(
          `${githubApiBase}/git/commits/${commitSha}`,
          { headers: { 'Authorization': authHeader, 'User-Agent': userAgent } }
        );
        const { tree: { sha: treeSha } } = await commitRes.json();

        // 步骤4: 创建新树
        const treeRes = await fetchWithTimeout(`${githubApiBase}/${repoPath}/git/trees`, {
          method: 'POST',
          headers: { 
            'Authorization': authHeader, 
            'Content-Type': 'application/json',
            'User-Agent': userAgent 
          },
          body: JSON.stringify({
            base_tree: treeSha,
            tree: [{
              path: `data/${fileName}`,
              mode: '100644',
              type: 'blob',
              sha: blobSha
            }]
          })
        });
        const { sha: newTreeSha } = await treeRes.json();

        // 步骤5: 创建新提交
        const newCommitRes = await fetchWithTimeout(`${githubApiBase}/${repoPath}/git/commits`, {
          method: 'POST',
          headers: { 
            'Authorization': authHeader, 
            'Content-Type': 'application/json',
            'User-Agent': userAgent 
          },
          body: JSON.stringify({
            message: `Upload ${fileName}`,
            tree: newTreeSha,
            parents: [commitSha]
          })
        });
        const { sha: newCommitSha } = await newCommitRes.json();

        // 步骤6: 更新分支引用
        const updateRes = await fetchWithTimeout(
          `${githubApiBase}/${repoPath}/git/refs/heads/${defaultBranch}`,
          {
            method: 'PATCH',
            headers: { 
              'Authorization': authHeader, 
              'Content-Type': 'application/json',
              'User-Agent': userAgent 
            },
            body: JSON.stringify({ sha: newCommitSha })
          }
        );

        if (!updateRes.ok) {
          const errData = await updateRes.json().catch(() => ({}));
          throw new Error(`更新分支失败: ${errData.message || updateRes.statusText}`);
        }

        return response.status(200).json({
          success: true,
          fileName,
          commitSha: newCommitSha
        });
      }

      default:
        return response
          .status(400)
          .json({ error: '未知操作', message: `不支持的 action: ${action}` });
    }
  } catch (error) {
    console.error('代理错误:', error);
    return response
      .status(500)
      .json({ error: '服务器错误', message: error.message });
  }
}
