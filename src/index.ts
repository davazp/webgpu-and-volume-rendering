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

  ctx.configure({
    device,
    format: navigator.gpu.getPreferredCanvasFormat(),
  });

  const canvasTexture = ctx.getCurrentTexture();

  const module = device?.createShaderModule({
    code: `

@vertex
fn vertex_shader (@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {

   let points = array(
     vec4f(1,-1,0,1),
     vec4f(-1,1,0,1),
     vec4f(-1,-1,0,1)
   );

   return points[index];
}

@fragment
fn fragment_shader () -> @location(0) vec4f {
   return vec4f(.5,.5,.5,1);
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
      targets: [
        {
          format: navigator.gpu.getPreferredCanvasFormat(),
        },
      ],
    },
  });

  const encoder = device.createCommandEncoder();

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
  pass.draw(3);
  pass.end();

  const commandBuffer = encoder.finish();

  device.queue.submit([commandBuffer]);
}

main();
