export const config = {
  runtime: 'edge', // 保持 Edge 运行时以确保低延迟
};

export default async (req) => {
  // 配置允许的前端域名（严格匹配模式）
  const allowedOrigins = [
    'https://Enqiliu66.github.io',
    'http://localhost:5500',
    'http://localhost:3000',
  ];

  // 处理跨域请求（修复 CORS 逻辑漏洞）
  const origin = req.headers.get('origin') || '';
  const isAllowed = allowedOrigins.includes(origin); // 严格匹配而非包含

  const corsHeaders = {
    'Access-Control-Allow-Origin': isAllowed ? origin : allowedOrigins[0],
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400', // 缓存预检预检ight 请求缓存时间（24小时）
  };

  // 处理预检请求
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // 验证 GitHub Token 配置
  const githubToken = process.env.GITHUB_TOKEN;
  if (!githubToken) {
    return new Response(
      JSON.stringify({
        error: 'GitHub Token 未配置，请在 Vercel 环境变量中设置',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }

  try {
    // 解析请求数据（支持非JSON格式请求体）
    const contentType = req.headers.get('Content-Type') || '';
    let requestData;
    if (contentType.includes('application/json')) {
      requestData = await req.json().catch(() => ({}));
    } else {
      // 处理表单数据或二进制数据（为分块上传预留）
      requestData = await req.text().catch(() => ({}));
      try {
        requestData = JSON.parse(requestData); // 尝试解析为JSON
      } catch {
        // 非JSON数据直接传递（如分块文件）
      }
    }

    // 提取核心参数（移除冗余的action参数）
    const { path, method = 'GET', body = {}, chunks = null, totalChunks = null } = requestData;

    // 严格验证参数合法性
    if (!path) {
      return new Response(
        JSON.stringify({ error: '缺少必要参数：path' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 验证path格式（防止路径遍历和恶意请求）
    const validPathRegex = /^\/repos\/[^\/]+\/[^\/]+\/(issues|comments|contents|releases)\/?.*$/;
    if (!validPathRegex.test(path)) {
      return new Response(
        JSON.stringify({ error: '非法的API路径，仅允许访问仓库相关资源' }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 验证HTTP方法合法性
    const allowedMethods = ['GET', 'POST', 'PUT', 'DELETE'];
    if (!allowedMethods.includes(method.toUpperCase())) {
      return new Response(
        JSON.stringify({ error: `不支持的请求方法：${method}` }),
        {
          status: 405,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 处理分块上传（基础支持）
    let requestBody = body;
    if (chunks && totalChunks) {
      // 此处示例中存储分块（实际生产环境需使用缓存/存储服务）
      console.log(`接收分块 ${chunks}/${totalChunks}，路径：${path}`);
      // 此处可扩展：将分块存储到Redis或临时文件系统
    }

    // 转发请求到GitHub API
    try {
      const githubUrl = `https://api.github.com${path}`;
      const fetchOptions = {
        method: method.toUpperCase(),
        headers: {
          'Authorization': `token ${githubToken}`,
          'Content-Type': contentType || 'application/json',
          'User-Agent': 'Eye-ED Experiment Agent',
          'Accept': 'application/vnd.github.v3+json',
        },
        body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? null :
              (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody)),
      };

      console.log(`转发请求到 GitHub API: ${githubUrl} (方法: ${method})`);
      const githubResponse = await fetch(githubUrl, fetchOptions);

      // 动态处理响应（支持非JSON格式）
      const responseContentType = githubResponse.headers.get('Content-Type') || '';
      let responseData;
      if (responseContentType.includes('application/json')) {
        responseData = await githubResponse.json().catch(() => ({}));
      } else {
        responseData = await githubResponse.text(); // 二进制数据或文本
      }

      // 构造响应头（继承GitHub的部分关键头信息）
      const responseHeaders = {
        ...corsHeaders,
        'Content-Type': responseContentType,
        'X-GitHub-Status': githubResponse.status,
      };

      return new Response(
        typeof responseData === 'string' ? responseData : JSON.stringify(responseData),
        {
          status: githubResponse.status,
          headers: responseHeaders,
        }
      );

    } catch (fetchErr) {
      // 细化错误处理
      if (fetchErr.cause?.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE') {
        console.error('SSL证书验证失败:', fetchErr.cause);
        return new Response(
          JSON.stringify({
            error: 'SSL证书验证失败',
            solutions: [
              '检查网络环境，关闭代理/VPN',
              '确保系统时间正确',
              '尝试使用最新版浏览器'
            ]
          }),
          {
            status: 502,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }

      console.error('GitHub API 请求失败:', fetchErr);
      return new Response(
        JSON.stringify({
          error: '与GitHub服务器通信失败',
          details: fetchErr.message
        }),
        {
          status: 503,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

  } catch (err) {
    console.error('请求处理异常:', err);
    return new Response(
      JSON.stringify({
        error: '服务器内部处理错误',
        details: process.env.NODE_ENV === 'development' ? err.message : '请联系管理员'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
};