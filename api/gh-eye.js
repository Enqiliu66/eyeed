export default async function handler(request, response) {
  // 提取请求来源并验证
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = [
    'https://Enqiliu66.github.io',
    'http://localhost:5500',
    'http://localhost:3000'
  ];
  const isAllowed = allowedOrigins.includes(origin);
  const corsOrigin = isAllowed ? origin : allowedOrigins[0];

  // 处理预检请求
  if (request.method === 'OPTIONS') {
    return response
      .setHeader('Access-Control-Allow-Credentials', 'true')
      .setHeader('Access-Control-Allow-Origin', corsOrigin)
      .setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      .setHeader('Access-Control-Max-Age', '86400')
      .status(200)
      .end();
  }

  // 设置基础CORS响应头
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Access-Control-Allow-Origin', corsOrigin);
  response.setHeader('Content-Type', 'application/json');

  try {
    // 验证请求方法（只允许POST）
    if (request.method !== 'POST') {
      return response.status(405).json({ error: '只允许POST请求' });
    }

    // 解析请求体
    const body = await request.json().catch(() => {
      throw new Error('无效的JSON格式');
    });
    const { action } = body;

    // 验证必要的环境变量
    if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO_OWNER || !process.env.GITHUB_REPO_NAME) {
      return response.status(500).json({
        error: '服务器配置不完整',
        message: '缺少必要的GitHub API配置'
      });
    }

    // GitHub API基础配置
    const githubApiBase = 'https://api.github.com';
    const repoPath = `repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`;
    const authHeader = `token ${process.env.GITHUB_TOKEN}`;
    const userAgent = 'Eye-ED Experiment API';

    switch (action) {
      case 'create_issue': {
        // 创建或获取Issue
        const { subjectId, gender, age } = body;
        if (!subjectId) {
          return response.status(400).json({ error: '缺少被试ID (subjectId)' });
        }

        // 先查询是否存在该被试的Issue
        const searchUrl = new URL(`${githubApiBase}/search/issues`);
        searchUrl.searchParams.set('q', `repo:${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}+title:${subjectId}+type:issue`);

        const searchResponse = await fetch(searchUrl.toString(), {
          headers: {
            'Authorization': authHeader,
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!searchResponse.ok) {
          throw new Error(`搜索Issue失败: ${searchResponse.statusText}`);
        }

        const searchData = await searchResponse.json();

        // 如果存在则返回现有Issue，否则创建新Issue
        if (searchData.total_count > 0) {
          return response.status(200).json(searchData.items[0]);
        } else {
          const createResponse = await fetch(`${githubApiBase}/${repoPath}/issues`, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
              'User-Agent': userAgent,
              'Accept': 'application/vnd.github.v3+json'
            },
            body: JSON.stringify({
              title: subjectId,
              body: `被试信息:\n- 性别: ${gender || '未知'}\n- 年龄: ${age || '未知'}\n- 实验开始时间: ${new Date().toISOString()}`
            })
          });

          const issueData = await createResponse.json();
          return response.status(createResponse.status).json(issueData);
        }
      }

      case 'add_comment': {
        // 添加评论到Issue
        const { issueNumber, commentBody } = body;
        if (!issueNumber || !commentBody) {
          return response.status(400).json({ error: '缺少Issue编号(issueNumber)或评论内容(commentBody)' });
        }

        const commentResponse = await fetch(`${githubApiBase}/${repoPath}/issues/${issueNumber}/comments`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({ body: commentBody })
        });

        if (!commentResponse.ok) {
          throw new Error(`添加评论失败: ${commentResponse.statusText}`);
        }

        const commentData = await commentResponse.json();
        return response.status(commentResponse.status).json(commentData);
      }

      case 'upload_csv': {
        // 上传CSV文件
        const { fileName, content } = body;
        if (!fileName || !content) {
          return response.status(400).json({ error: '缺少文件名(fileName)或文件内容(content)' });
        }

        // 计算文件SHA（GitHub API要求）
        const blobResponse = await fetch(`${githubApiBase}/git/blobs`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({
            content: Buffer.from(content).toString('base64'),
            encoding: 'base64'
          })
        });

        if (!blobResponse.ok) {
          throw new Error(`创建文件blob失败: ${blobResponse.statusText}`);
        }

        const blobData = await blobResponse.json();
        if (!blobData.sha) {
          return response.status(500).json({ error: '创建文件blob失败，未返回SHA' });
        }

        // 获取主分支引用
        const refResponse = await fetch(`${githubApiBase}/${repoPath}/git/refs/heads/main`, {
          headers: {
            'Authorization': authHeader,
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!refResponse.ok) {
          throw new Error(`获取主分支引用失败: ${refResponse.statusText}`);
        }

        const refData = await refResponse.json();
        if (!refData.object?.sha) {
          return response.status(500).json({ error: '获取主分支引用失败，未找到SHA' });
        }

        // 获取最新提交
        const commitResponse = await fetch(`${githubApiBase}/git/commits/${refData.object.sha}`, {
          headers: {
            'Authorization': authHeader,
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!commitResponse.ok) {
          throw new Error(`获取最新提交失败: ${commitResponse.statusText}`);
        }

        const commitData = await commitResponse.json();

        // 创建树
        const treeResponse = await fetch(`${githubApiBase}/${repoPath}/git/trees`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({
            base_tree: commitData.tree.sha,
            tree: [{
              path: `data/${fileName}`,  // 保存到data目录
              mode: '100644',
              type: 'blob',
              sha: blobData.sha
            }]
          })
        });

        if (!treeResponse.ok) {
          throw new Error(`创建树失败: ${treeResponse.statusText}`);
        }

        const treeData = await treeResponse.json();

        // 创建新提交
        const newCommitResponse = await fetch(`${githubApiBase}/${repoPath}/git/commits`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({
            message: `上传数据文件: ${fileName}`,
            tree: treeData.sha,
            parents: [commitData.sha]
          })
        });

        if (!newCommitResponse.ok) {
          throw new Error(`创建新提交失败: ${newCommitResponse.statusText}`);
        }

        const newCommitData = await newCommitResponse.json();

        // 更新分支引用
        const updateRefResponse = await fetch(`${githubApiBase}/${repoPath}/git/refs/heads/main`, {
          method: 'PATCH',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({
            sha: newCommitData.sha
          })
        });

        if (!updateRefResponse.ok) {
          throw new Error(`更新分支引用失败: ${updateRefResponse.statusText}`);
        }

        return response.status(200).json({ success: true, fileName, commitSha: newCommitData.sha });
      }

      default:
        return response.status(400).json({ error: '未知操作', availableActions: ['create_issue', 'add_comment', 'upload_csv'] });
    }
  } catch (error) {
    console.error('API错误:', error);
    return response.status(500).json({
      error: '服务器处理失败',
      message: error.message,
      // 生产环境可移除stack
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// 配置Edge Function
export const config = {
  runtime: 'edge',
};