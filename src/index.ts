async function main() {
  const adapter = await navigator.gpu.requestAdapter();
  console.log("adapter", adapter);

  const device = await adapter?.requestDevice();
  console.log("device", device);

  const canvas = document.querySelector<HTMLCanvasElement>("#canvas");
  if (!canvas) {
    throw new Error(`canvas not found`);
  }

  if (!device) {
    throw new Error("could not initialize module");
  }

  const ctx = canvas.getContext("webgpu");
  if (!ctx) {
    throw new Error(`could not initialize canvas for webgpu`);
  }

  const format = navigator.gpu.getPreferredCanvasFormat();

  ctx.configure({
    device,
    format,
  });

  const module = device?.createShaderModule({
    code: `

struct Out {
  @builtin(position) position: vec4f,
  @location(0) pos: vec4f
}

struct Uniforms {
  time: f32
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;

@vertex
fn vertex_shader (@builtin(vertex_index) index: u32) -> Out {

   let points = array(
     vec4f(1,-1,0,1),
     vec4f(-1,1,0,1),
     vec4f(-1,-1,0,1),

     vec4f(1,-1,0,1),
     vec4f(-1,1,0,1),
     vec4f(1,1,0,1)
   );

   return Out(points[index], points[index]);
}

@fragment
fn fragment_shader (@location(0) p: vec4f) -> @location(0) vec4f {
   return vec4f(abs(p.x), abs(p.y), 1, 1);
}

`,
  });

  const pipeline = device.createRenderPipeline({
    layout: "auto",
    vertex: {
      module,
    },
    fragment: {
      module,
      targets: [{ format }],
    },
  });

  const uniformsBuffer = device.createBuffer({
    size: 4,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
  });

  let tick = 10;

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      {
        binding: 0,
        resource: {
          buffer: uniformsBuffer,
        },
      },
    ],
  });

  const render = () => {
    device.queue.writeBuffer(uniformsBuffer, 0, new Float32Array([tick]));
    const encoder = device.createCommandEncoder();

    const canvasTexture = ctx.getCurrentTexture();

    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: canvasTexture.createView(),
          loadOp: "clear",
          storeOp: "store",
        },
      ],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(6);
    pass.end();

    const commandBuffer = encoder.finish();

    device.queue.submit([commandBuffer]);
  };

  function animate() {
    tick += 1 / 16;
    render();
    requestAnimationFrame(animate);
  }

  animate();
}

main();
