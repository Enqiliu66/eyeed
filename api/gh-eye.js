async function handler(request) {  // Edge 运行时中 response 参数无需显式传入，通过返回值处理
  // 提前验证必要的环境变量
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_REPO_OWNER || !process.env.GITHUB_REPO_NAME) {
    return new Response(
      JSON.stringify({ error: '服务器配置不完整', message: '缺少必要的GitHub API配置' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // 提取请求来源并验证
  const origin = request.headers.get('origin') || '';
  const allowedOrigins = [
    'https://Enqiliu66.github.io',
    'http://localhost:5500',
    'http://localhost:3000'
  ];
  const isAllowed = allowedOrigins.includes(origin);
  const corsOrigin = isAllowed ? origin : '';

  // 处理预检请求
  if (request.method === 'OPTIONS') {
    const headers = new Headers();
    headers.set('Access-Control-Allow-Credentials', 'true');
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type');
    headers.set('Access-Control-Max-Age', '86400');
    if (corsOrigin) headers.set('Access-Control-Allow-Origin', corsOrigin);

    return new Response(null, { headers, status: 200 });
  }

  // 设置基础响应头
  const responseHeaders = new Headers();
  responseHeaders.set('Access-Control-Allow-Credentials', 'true');
  if (corsOrigin) responseHeaders.set('Access-Control-Allow-Origin', corsOrigin);
  responseHeaders.set('Content-Type', 'application/json');

  try {
    if (request.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: '方法不允许', message: '只支持POST请求' }),
        { status: 405, headers: responseHeaders }
      );
    }

    // 解析请求体
    let body;
    try {
      body = await request.json();
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: '请求格式错误', message: '无效的JSON格式，请检查请求体' }),
        { status: 400, headers: responseHeaders }
      );
    }

    const { action } = body;
    if (!action) {
      return new Response(
        JSON.stringify({
          error: '缺少参数',
          message: '必须指定操作类型(action)',
          availableActions: ['create_issue', 'add_comment', 'upload_csv']
        }),
        { status: 400, headers: responseHeaders }
      );
    }

    // GitHub API基础配置
    const githubApiBase = 'https://api.github.com';
    const repoPath = `repos/${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}`;
    const authHeader = `token ${process.env.GITHUB_TOKEN}`;
    const userAgent = 'Eye-ED Experiment API';

    // 添加fetch超时设置
    const fetchWithTimeout = async (url, options, timeout = 10000) => {
      return Promise.race([
        fetch(url, options),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('请求超时')), timeout)
        )
      ]);
    };

    switch (action) {
      case 'create_issue': {
        const { subjectId, gender, age } = body;
        if (!subjectId) {
          return new Response(
            JSON.stringify({ error: '缺少参数', message: '被试ID (subjectId)为必填项' }),
            { status: 400, headers: responseHeaders }
          );
        }

        // 先查询是否存在该被试的Issue
        const searchUrl = new URL(`${githubApiBase}/search/issues`);
        searchUrl.searchParams.set('q', `repo:${process.env.GITHUB_REPO_OWNER}/${process.env.GITHUB_REPO_NAME}+title:${encodeURIComponent(subjectId)}+type:issue`);

        const searchResponse = await fetchWithTimeout(searchUrl.toString(), {
          headers: {
            'Authorization': authHeader,
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!searchResponse.ok) {
          throw new Error(`搜索Issue失败: ${searchResponse.status} ${searchResponse.statusText}`);
        }

        const searchData = await searchResponse.json();

        // 如果存在则返回现有Issue，否则创建新Issue
        if (searchData.total_count > 0) {
          return new Response(
            JSON.stringify({ ...searchData.items[0], message: 'Issue已存在' }),
            { status: 200, headers: responseHeaders }
          );
        } else {
          const createResponse = await fetchWithTimeout(`${githubApiBase}/${repoPath}/issues`, {
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
          return new Response(JSON.stringify(issueData), {
            status: createResponse.status,
            headers: responseHeaders
          });
        }
      }

      case 'add_comment': {
        const { issueNumber, commentBody } = body;
        if (issueNumber === undefined || !commentBody) {
          return new Response(
            JSON.stringify({
              error: '缺少参数',
              message: 'Issue编号(issueNumber)和评论内容(commentBody)均为必填项'
            }),
            { status: 400, headers: responseHeaders }
          );
        }
        if (typeof issueNumber !== 'number' || !Number.isInteger(issueNumber) || issueNumber <= 0) {
          return new Response(
            JSON.stringify({
              error: '参数错误',
              message: 'issueNumber必须为正整数'
            }),
            { status: 400, headers: responseHeaders }
          );
        }

        const commentResponse = await fetchWithTimeout(`${githubApiBase}/${repoPath}/issues/${issueNumber}/comments`, {
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
          throw new Error(`添加评论失败: ${commentResponse.status} ${commentResponse.statusText}`);
        }

        const commentData = await commentResponse.json();
        return new Response(JSON.stringify(commentData), {
          status: commentResponse.status,
          headers: responseHeaders
        });
      }

      case 'upload_csv': {
        const { fileName, content } = body;
        if (!fileName || !content) {
          return new Response(
            JSON.stringify({
              error: '缺少参数',
              message: '文件名(fileName)和文件内容(content)均为必填项'
            }),
            { status: 400, headers: responseHeaders }
          );
        }
        if (!fileName.endsWith('.csv')) {
          return new Response(
            JSON.stringify({
              error: '文件格式错误',
              message: '文件名必须以.csv结尾'
            }),
            { status: 400, headers: responseHeaders }
          );
        }

        // 使用 Web API 替代 Node.js 的 Buffer（Edge 运行时兼容）
        const base64Content = btoa(unescape(encodeURIComponent(content)));

        // 计算文件SHA（GitHub API要求）
        const blobResponse = await fetchWithTimeout(`${githubApiBase}/git/blobs`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({
            content: base64Content,
            encoding: 'base64'
          })
        });

        if (!blobResponse.ok) {
          throw new Error(`创建文件blob失败: ${blobResponse.status} ${blobResponse.statusText}`);
        }

        const blobData = await blobResponse.json();
        if (!blobData.sha) {
          return new Response(
            JSON.stringify({ error: '创建文件blob失败', message: '未返回SHA值' }),
            { status: 500, headers: responseHeaders }
          );
        }

        // 获取主分支引用
        const defaultBranch = process.env.GITHUB_DEFAULT_BRANCH || 'main';
        const refResponse = await fetchWithTimeout(`${githubApiBase}/${repoPath}/git/refs/heads/${defaultBranch}`, {
          headers: {
            'Authorization': authHeader,
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!refResponse.ok) {
          throw new Error(`获取${defaultBranch}分支引用失败: ${refResponse.status} ${refResponse.statusText}`);
        }

        const refData = await refResponse.json();
        if (!refData.object?.sha) {
          return new Response(
            JSON.stringify({ error: '获取分支引用失败', message: '未找到分支SHA' }),
            { status: 500, headers: responseHeaders }
          );
        }

        // 获取最新提交
        const commitResponse = await fetchWithTimeout(`${githubApiBase}/git/commits/${refData.object.sha}`, {
          headers: {
            'Authorization': authHeader,
            'User-Agent': userAgent,
            'Accept': 'application/vnd.github.v3+json'
          }
        });

        if (!commitResponse.ok) {
          throw new Error(`获取最新提交失败: ${commitResponse.status} ${commitResponse.statusText}`);
        }

        const commitData = await commitResponse.json();

        // 创建树
        const treeResponse = await fetchWithTimeout(`${githubApiBase}/${repoPath}/git/trees`, {
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
              path: `data/${fileName}`,
              mode: '100644',
              type: 'blob',
              sha: blobData.sha
            }]
          })
        });

        if (!treeResponse.ok) {
          throw new Error(`创建树失败: ${treeResponse.status} ${treeResponse.statusText}`);
        }

        const treeData = await treeResponse.json();

        // 创建新提交
        const newCommitResponse = await fetchWithTimeout(`${githubApiBase}/${repoPath}/git/commits`, {
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
          throw new Error(`创建新提交失败: ${newCommitResponse.status} ${newCommitResponse.statusText}`);
        }

        const newCommitData = await newCommitResponse.json();

        // 更新分支引用
        const updateRefResponse = await fetchWithTimeout(`${githubApiBase}/${repoPath}/git/refs/heads/${defaultBranch}`, {
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
          throw new Error(`更新分支引用失败: ${updateRefResponse.status} ${updateRefResponse.statusText}`);
        }

        return new Response(
          JSON.stringify({
            success: true,
            fileName,
            commitSha: newCommitData.sha,
            message: `文件已成功上传至${defaultBranch}分支`
          }),
          { status: 200, headers: responseHeaders }
        );
      }

      default:
        return new Response(
          JSON.stringify({
            error: '未知操作',
            message: `不支持的操作类型: ${action}`,
            availableActions: ['create_issue', 'add_comment', 'upload_csv']
          }),
          { status: 400, headers: responseHeaders }
        );
    }
  } catch (error) {
    console.error('API错误:', error);
    return new Response(
      JSON.stringify({ error: '服务器处理失败', message: error.message }),
      { status: 500, headers: responseHeaders }
    );
  }
}

export default handler;  // Edge 函数必须显式导出默认处理函数